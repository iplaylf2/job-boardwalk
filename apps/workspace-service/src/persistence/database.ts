import { DatabaseSync } from "node:sqlite";
import { existsSync } from "node:fs";
import { migrate } from "drizzle-orm/node-sqlite/migrator";
import { drizzle } from "drizzle-orm/node-sqlite";

const firstParameterIndex = 0;

export type WorkspaceDatabase = ReturnType<typeof drizzle>;

type WorkspaceTransactionCallback = Parameters<
  WorkspaceDatabase["transaction"]
>[typeof firstParameterIndex];

export type WorkspaceTransaction =
  Parameters<WorkspaceTransactionCallback>[typeof firstParameterIndex];

export function openWorkspaceDatabase(
  databasePath: string,
  migrationsDirectory: string,
): { client: DatabaseSync; database: WorkspaceDatabase } {
  if (!existsSync(migrationsDirectory)) {
    throw new Error(`找不到 Workspace Service 数据库迁移目录：${migrationsDirectory}`);
  }
  const client = new DatabaseSync(databasePath);
  try {
    client.exec("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 3000;");
    const database = drizzle({ client });
    migrate(database, { migrationsFolder: migrationsDirectory });
    return { client, database };
  } catch (error) {
    client.close();
    throw error;
  }
}
