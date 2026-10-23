import type { Pool } from "pg";

/**
 * Fails fast when schema.sql has not been applied, instead of surfacing
 * "relation does not exist" on the first request. Both entry points share this check.
 */
export async function requireDatabaseSchema(pool: Pool, tables: readonly string[]): Promise<void> {
  const { rows } = await pool.query<{ tableName: string; exists: string | null }>(
    'SELECT name AS "tableName", to_regclass(name) AS exists FROM unnest($1::text[]) AS name',
    [tables],
  );
  const missing = rows.filter((row) => !row.exists).map((row) => row.tableName);
  if (missing.length) {
    await pool.end();
    throw new Error(`Database schema is missing (${missing.join(", ")}). Apply examples/multi-node/schema.sql first.`);
  }
}
