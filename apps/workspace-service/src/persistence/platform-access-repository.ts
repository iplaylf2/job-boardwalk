import { and, asc, desc, eq } from "drizzle-orm";
import type {
  PlatformAccessObservation,
  RecordedPlatformAccessObservation,
} from "@job-boardwalk/contracts";
import { isPlatformId } from "@job-boardwalk/platform-catalog";
import { platformAccessObservations } from "./schema.js";
import type { WorkspaceDatabase } from "./database.js";

type PlatformAccessObservationRow = typeof platformAccessObservations.$inferSelect;

function samePlatformAccessState(
  left: RecordedPlatformAccessObservation,
  right: PlatformAccessObservation,
): boolean {
  return (
    left.platformId === right.platformId &&
    ("authenticationState" in left ? left.authenticationState : null) ===
      ("authenticationState" in right ? right.authenticationState : null) &&
    ("interruption" in left ? left.interruption : null) ===
      ("interruption" in right ? right.interruption : null) &&
    left.evidence === right.evidence
  );
}

function toRecordedPlatformAccessObservationMetadata(row: PlatformAccessObservationRow) {
  if (!isPlatformId(row.platformId)) {
    throw new Error(`数据库中存在未知招聘平台：${row.platformId}`);
  }
  return {
    id: row.id,
    lastObservedAt: row.lastObservedAt,
    observedAt: row.observedAt,
    platformId: row.platformId,
    url: row.url,
  };
}

function toRecordedPlatformAccessObservation(
  row: PlatformAccessObservationRow,
): RecordedPlatformAccessObservation {
  const observationMetadata = toRecordedPlatformAccessObservationMetadata(row);
  if (
    row.authenticationState === "authenticated" &&
    row.interruption === null &&
    (row.evidence === "protected-resource" || row.evidence === "authenticated-page")
  ) {
    return {
      ...observationMetadata,
      authenticationState: row.authenticationState,
      evidence: row.evidence,
    };
  }
  if (
    row.authenticationState === "unauthenticated" &&
    row.interruption === null &&
    row.evidence === "login-redirect"
  ) {
    return {
      ...observationMetadata,
      authenticationState: row.authenticationState,
      evidence: row.evidence,
    };
  }
  if (
    row.authenticationState === null &&
    row.interruption === "verification-required" &&
    row.evidence === "verification-page"
  ) {
    return { ...observationMetadata, evidence: row.evidence, interruption: row.interruption };
  }
  if (
    row.authenticationState === null &&
    row.interruption === "access-denied" &&
    row.evidence === "access-denied-page"
  ) {
    return { ...observationMetadata, evidence: row.evidence, interruption: row.interruption };
  }
  throw new Error(
    `数据库中的平台访问观察不匹配：${row.authenticationState}/${row.interruption}/${row.evidence}`,
  );
}
export class PlatformAccessRepository {
  readonly #database: WorkspaceDatabase;

  public constructor(database: WorkspaceDatabase) {
    this.#database = database;
  }
  public recordPlatformAccessObservation(
    observation: PlatformAccessObservation,
  ): RecordedPlatformAccessObservation {
    const row = this.#database
      .insert(platformAccessObservations)
      .values({ ...observation, lastObservedAt: observation.observedAt })
      .returning()
      .get();
    return toRecordedPlatformAccessObservation(row);
  }

  public reconcilePlatformAccessObservation(
    observation: PlatformAccessObservation,
  ): RecordedPlatformAccessObservation | null {
    const latestRow = this.#database
      .select()
      .from(platformAccessObservations)
      .where(
        and(
          eq(platformAccessObservations.platformId, observation.platformId),
          eq(platformAccessObservations.url, observation.url),
        ),
      )
      .orderBy(desc(platformAccessObservations.lastObservedAt), desc(platformAccessObservations.id))
      .get();
    const latest = latestRow ? toRecordedPlatformAccessObservation(latestRow) : null;
    if (latest && observation.observedAt <= latest.lastObservedAt) {
      return null;
    }
    if (!latest || !samePlatformAccessState(latest, observation)) {
      return this.recordPlatformAccessObservation(observation);
    }
    this.#database
      .update(platformAccessObservations)
      .set({ lastObservedAt: observation.observedAt })
      .where(eq(platformAccessObservations.id, latest.id))
      .run();
    return null;
  }

  public listPlatformAccessObservations(): RecordedPlatformAccessObservation[] {
    return this.#database
      .select()
      .from(platformAccessObservations)
      .orderBy(
        asc(platformAccessObservations.platformId),
        desc(platformAccessObservations.lastObservedAt),
        desc(platformAccessObservations.id),
      )
      .all()
      .map(toRecordedPlatformAccessObservation);
  }
}
