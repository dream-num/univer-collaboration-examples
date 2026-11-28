// Runs a whole migration: open both sides, check the source schema, list Units, migrate them with a
// bounded concurrency and record every result in the manifest. Resources opened here are closed here.
import { mapWithLimit } from "../concurrency.js";
import type { MigrationConfig } from "../config.js";
import { validateConfig } from "../config.js";
import { ManifestWriter } from "../manifest.js";
import type { UnitResult } from "../model.js";
import { createS3Client, UniverserBlobStore } from "../s3.js";
import { createUniverserPool, UniverserDatabase } from "../source/universer-database.js";
import { UnitReader } from "../source/unit-reader.js";
import { TargetStore } from "../target/target-store.js";
import { ReplayVerifier } from "../verify/replay-verifier.js";
import { UnitMigrator } from "./migrate-unit.js";

/** Outcome of a whole run. Per-Unit details are also written to the manifest file. */
export interface MigrationSummary {
  readonly total: number;
  /** Number of Units per `UnitResult.status`. */
  readonly byStatus: Readonly<Record<string, number>>;
  readonly failed: readonly UnitResult[];
  /** IDs permanently deleted in Universer. They are not migrated and must not be reused. */
  readonly hardDeleted: readonly string[];
}

/** Called once per Unit when it finishes, in completion order. */
export type ProgressListener = (result: UnitResult, done: number, total: number) => void;

/**
 * Migrates Universer Units into the PostgreSQL + S3 database adapter. Universer is only read. Running
 * again is safe: Units already in the target only receive the revisions they are missing.
 *
 * Rejects when the run cannot start (configuration, Universer schema, target schema version). A failing
 * Unit does not stop the run; it is reported in `MigrationSummary.failed`.
 */
export async function runMigration(config: MigrationConfig, onProgress?: ProgressListener): Promise<MigrationSummary> {
  validateConfig(config);
  // Each Unit holds one source connection while it is read and one target connection while it is written.
  const poolSize = config.concurrency + 2;
  const sourcePool = createUniverserPool(config.source.databaseUrl, poolSize);
  const sourceS3 = createS3Client(config.source.s3);
  const targetS3 = config.dryRun ? undefined : createS3Client(config.target.s3);
  let target: TargetStore | undefined;
  let verifier: ReplayVerifier | undefined;
  const manifest = new ManifestWriter(config.manifestPath);
  try {
    const database = new UniverserDatabase(sourcePool);
    const missingColumns = await database.findMissingColumns();
    if (missingColumns.length) {
      throw new Error(
        `The Universer schema is not supported (missing ${missingColumns.join(", ")}). Upgrade Universer to 1.6.2 first.`,
      );
    }
    if (targetS3) {
      target = await TargetStore.open({
        databaseUrl: config.target.databaseUrl,
        s3Client: targetS3,
        bucket: config.target.s3.bucket,
        ...(config.target.blockPrefix ? { blockPrefix: config.target.blockPrefix } : {}),
        poolSize,
      });
      if (config.verify) verifier = new ReplayVerifier(target.core);
    }
    const migrator = new UnitMigrator({
      reader: new UnitReader(database, new UniverserBlobStore(sourceS3, config.source.s3.bucket)),
      ...(target ? { target } : {}),
      ...(verifier ? { verifier } : {}),
      blockDedupe: config.blockDedupe,
      defaultCreatorID: config.defaultCreatorID,
    });

    const units = await database.listUnits(config.unitIDs);
    const hardDeleted = await database.listHardDeletedUnitIDs();
    manifest.writeHardDeleted(hardDeleted);

    let done = 0;
    const results = await mapWithLimit(units, config.concurrency, async (unit) => {
      const result = await migrator.migrate(unit);
      manifest.writeUnit(result);
      onProgress?.(result, ++done, units.length);
      return result;
    });

    const byStatus: Record<string, number> = {};
    for (const result of results) byStatus[result.status] = (byStatus[result.status] ?? 0) + 1;
    return {
      total: results.length,
      byStatus,
      failed: results.filter((result) => result.status === "failed"),
      hardDeleted,
    };
  } finally {
    await verifier?.dispose();
    await target?.close();
    targetS3?.destroy();
    sourceS3.destroy();
    await sourcePool.end();
    await manifest.close();
  }
}
