// The manifest is a JSON Lines file: one line per Unit, plus one line listing the Units Universer has
// permanently deleted. It is appended as Units finish, so an interrupted run keeps what it recorded.
import { createWriteStream, type WriteStream } from "node:fs";
import type { UnitResult } from "./model.js";

export class ManifestWriter {
  private readonly _stream: WriteStream;

  constructor(path: string) {
    this._stream = createWriteStream(path, { flags: "a" });
  }

  writeUnit(result: UnitResult): void {
    this._write({ kind: "unit", at: new Date().toISOString(), ...result });
  }

  /** Their IDs must not be reused for new documents; the business system has to keep them reserved. */
  writeHardDeleted(unitIDs: readonly string[]): void {
    this._write({ kind: "hard-deleted", at: new Date().toISOString(), unitIDs });
  }

  async close(): Promise<void> {
    await new Promise<void>((resolve, reject) => this._stream.end((error?: Error | null) => (error ? reject(error) : resolve())));
  }

  private _write(line: object): void {
    this._stream.write(`${JSON.stringify(line)}\n`);
  }
}
