import { randomUUID } from "node:crypto";
import type { Pool } from "pg";

/** An uploaded source file or an exported result, stored in the exchange_files table. */
export interface ExchangeFile {
  readonly data: Buffer;
  readonly fileName: string;
  readonly contentType: string;
}

export type ExchangeTaskKind = "import" | "export";
export type ExchangeTaskStatus = "pending" | "running" | "done" | "failed";

export type ExchangeTaskResult =
  | { readonly import: { outputType: 1; unitID: string; jsonID: "" } }
  | { readonly export: { fileID: string; fileUrl: string } };

export interface ExchangeTask {
  readonly taskID: string;
  readonly kind: ExchangeTaskKind;
  readonly status: ExchangeTaskStatus;
  readonly result: ExchangeTaskResult | null;
  readonly error: string | null;
}

/**
 * Keeps exchange tasks and files in PostgreSQL so every exchange replica sees the same state:
 * the replica that accepts an upload or starts a task need not be the one that answers the
 * task poll or serves the download. The tables are defined in ../schema.sql.
 * Production deployments keep file bytes in object storage and only the metadata here.
 */
export class PostgresExchangeStore {
  constructor(private readonly _pool: Pool) {}

  async saveFile(file: ExchangeFile): Promise<string> {
    const fileID = randomUUID();
    await this._pool.query(
      "INSERT INTO exchange_files (file_id, file_name, content_type, data, created_at_ms) VALUES ($1, $2, $3, $4, $5)",
      [fileID, file.fileName, file.contentType, file.data, Date.now()],
    );
    return fileID;
  }

  async getFile(fileID: string): Promise<ExchangeFile | null> {
    const { rows } = await this._pool.query<ExchangeFile>(
      'SELECT data, file_name AS "fileName", content_type AS "contentType" FROM exchange_files WHERE file_id = $1',
      [fileID],
    );
    return rows[0] ?? null;
  }

  /** Reads the file name without loading the bytes; used for validation and display names. */
  async getFileName(fileID: string): Promise<string | null> {
    const { rows } = await this._pool.query<{ fileName: string }>(
      'SELECT file_name AS "fileName" FROM exchange_files WHERE file_id = $1',
      [fileID],
    );
    return rows[0]?.fileName ?? null;
  }

  async deleteFile(fileID: string): Promise<void> {
    await this._pool.query("DELETE FROM exchange_files WHERE file_id = $1", [fileID]);
  }

  async createTask(kind: ExchangeTaskKind): Promise<string> {
    const taskID = randomUUID();
    const now = Date.now();
    await this._pool.query(
      "INSERT INTO exchange_tasks (task_id, kind, status, created_at_ms, updated_at_ms) VALUES ($1, $2, 'pending', $3, $3)",
      [taskID, kind, now],
    );
    return taskID;
  }

  async startTask(taskID: string): Promise<void> {
    await this._pool.query(
      "UPDATE exchange_tasks SET status = 'running', updated_at_ms = $2 WHERE task_id = $1",
      [taskID, Date.now()],
    );
  }

  async completeTask(taskID: string, result: ExchangeTaskResult): Promise<void> {
    await this._pool.query(
      "UPDATE exchange_tasks SET status = 'done', result = $2, updated_at_ms = $3 WHERE task_id = $1",
      [taskID, JSON.stringify(result), Date.now()],
    );
  }

  async failTask(taskID: string, error: string): Promise<void> {
    await this._pool.query(
      "UPDATE exchange_tasks SET status = 'failed', error = $2, updated_at_ms = $3 WHERE task_id = $1",
      [taskID, error, Date.now()],
    );
  }

  async getTask(taskID: string): Promise<ExchangeTask | null> {
    const { rows } = await this._pool.query<ExchangeTask>(
      'SELECT task_id AS "taskID", kind, status, result, error FROM exchange_tasks WHERE task_id = $1',
      [taskID],
    );
    return rows[0] ?? null;
  }
}
