// Copy of examples/file-service/server/file-store.ts. file-service is the source: change it there
// first, then mirror the change here so the copies stay identical apart from this header.
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * File metadata kept next to the stored bytes.
 *
 * `source` is the `source` query parameter the uploader sent, kept as the raw string (`""` when
 * omitted). Univer clients send the numeric `FileSource` enum from `@univerjs/protocol`, and the
 * value tells the application how long to keep the file:
 * - `FileSource.HttpImport` (`"1"`, a file uploaded for import) and `FileSource.HttpExport`
 *   (`"2"`, a conversion result written by the server) are temporary. The import route deletes
 *   its source file once the Unit exists; an export result can be deleted after it has been
 *   downloaded.
 * - Every other value, including the default empty string and `FileSource.UnitEmbedded` (`"3"`,
 *   images and attachments inserted into a Unit), is persistent. These files share the lifecycle
 *   of the Unit named by `assign` and must be kept as long as that Unit exists.
 */
export interface StoredFileMetadata {
  readonly fileID: string;
  readonly fileName: string;
  readonly contentType: string;
  readonly size: number;
  readonly source: string;
  readonly assign: string;
  readonly createdAt: string;
}

export interface SaveFileInput {
  readonly data: Buffer;
  readonly fileName: string;
  readonly contentType: string;
  readonly source?: string | undefined;
  readonly assign?: string | undefined;
}

const INDEX_FILE = "index.json";

/**
 * Stores file bytes at `<directory>/<fileID>` and metadata in `<directory>/index.json`, so uploads
 * and export results survive a server restart. Index writes are serialized through a promise chain;
 * a production application should use object storage and a database table instead.
 */
export class FileStore {
  private readonly files = new Map<string, StoredFileMetadata>();
  private pendingWrite: Promise<void> = Promise.resolve();

  private constructor(readonly directory: string) {}

  static async open(directory: string): Promise<FileStore> {
    await mkdir(directory, { recursive: true });
    const store = new FileStore(directory);
    try {
      const index = JSON.parse(
        await readFile(join(directory, INDEX_FILE), "utf8"),
      ) as StoredFileMetadata[];
      for (const file of index) store.files.set(file.fileID, file);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    return store;
  }

  get(fileID: string): StoredFileMetadata | undefined {
    return this.files.get(fileID);
  }

  /** Absolute path of the stored bytes; only meaningful when `get()` returns metadata. */
  private pathOf(fileID: string): string {
    return join(this.directory, fileID);
  }

  async read(fileID: string): Promise<Buffer | undefined> {
    if (!this.files.has(fileID)) return undefined;
    return readFile(this.pathOf(fileID));
  }

  async save(input: SaveFileInput): Promise<StoredFileMetadata> {
    const metadata: StoredFileMetadata = {
      fileID: randomUUID(),
      fileName: input.fileName,
      contentType: input.contentType,
      size: input.data.byteLength,
      source: input.source ?? "",
      assign: input.assign ?? "",
      createdAt: new Date().toISOString(),
    };
    await writeFile(this.pathOf(metadata.fileID), input.data);
    this.files.set(metadata.fileID, metadata);
    await this.writeIndex();
    return metadata;
  }

  async delete(fileID: string): Promise<void> {
    if (!this.files.delete(fileID)) return;
    await rm(this.pathOf(fileID), { force: true });
    await this.writeIndex();
  }

  private writeIndex(): Promise<void> {
    const snapshot = JSON.stringify([...this.files.values()], null, 2);
    const write = this.pendingWrite.then(() =>
      writeFile(join(this.directory, INDEX_FILE), snapshot),
    );
    // Report the failure to this caller, but keep the chain settled so later writes still run.
    this.pendingWrite = write.catch(() => undefined);
    return write;
  }
}
