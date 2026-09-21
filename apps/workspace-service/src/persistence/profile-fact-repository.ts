import { asc, eq } from "drizzle-orm";
import type { ProfileFact } from "@job-boardwalk/contracts";
import { profileFacts, workspaceChanges } from "./schema.js";
import type { WorkspaceDatabase } from "./database.js";

export class ProfileFactRepository {
  readonly #database: WorkspaceDatabase;

  public constructor(database: WorkspaceDatabase) {
    this.#database = database;
  }
  public listProfileFacts(): ProfileFact[] {
    return this.#database.select().from(profileFacts).orderBy(asc(profileFacts.key)).all();
  }

  public createProfileFact(input: {
    confirmed: boolean;
    initiatedBy: "agent" | "system" | "user";
    key: string;
    reason: string;
    source: string;
    value: string;
  }): ProfileFact {
    const now = new Date().toISOString();
    return this.#database.transaction((transaction) => {
      const created = transaction
        .insert(profileFacts)
        .values({
          confirmed: input.confirmed,
          key: input.key,
          source: input.source,
          updatedAt: now,
          value: input.value,
        })
        .returning()
        .get();
      transaction
        .insert(workspaceChanges)
        .values({
          initiatedBy: input.initiatedBy,
          occurredAt: now,
          operation: "create-profile-fact",
          reason: input.reason,
          subject: input.key,
        })
        .run();
      return created;
    });
  }

  public updateProfileFact(input: {
    confirmed: boolean;
    id: number;
    initiatedBy: "agent" | "system" | "user";
    key: string;
    reason: string;
    source: string;
    value: string;
  }): ProfileFact | null {
    const now = new Date().toISOString();
    return this.#database.transaction((transaction) => {
      const updated = transaction
        .update(profileFacts)
        .set({
          confirmed: input.confirmed,
          key: input.key,
          source: input.source,
          updatedAt: now,
          value: input.value,
        })
        .where(eq(profileFacts.id, input.id))
        .returning()
        .get();
      if (!updated) {
        return null;
      }
      transaction
        .insert(workspaceChanges)
        .values({
          initiatedBy: input.initiatedBy,
          occurredAt: now,
          operation: "update-profile-fact",
          reason: input.reason,
          subject: input.key,
        })
        .run();
      return updated;
    });
  }

  public deleteProfileFact(input: {
    id: number;
    initiatedBy: "agent" | "system" | "user";
    reason: string;
  }): void {
    const now = new Date().toISOString();
    this.#database.transaction((transaction) => {
      const deleted = transaction
        .delete(profileFacts)
        .where(eq(profileFacts.id, input.id))
        .returning({ key: profileFacts.key })
        .get();
      if (deleted) {
        transaction
          .insert(workspaceChanges)
          .values({
            initiatedBy: input.initiatedBy,
            occurredAt: now,
            operation: "delete-profile-fact",
            reason: input.reason,
            subject: deleted.key,
          })
          .run();
      }
    });
  }
}
