// Command line entry: parse flags and environment variables into a MigrationConfig, run it, print
// progress and a summary. Secrets (database URLs, access keys) may come from the environment so they
// stay out of the shell history.
import { parseArgs } from "node:util";
import { parseBooleanEnv, type MigrationConfig, type S3Location } from "./config.js";
import { runMigration } from "./pipeline/run-migration.js";

const HELP = `Usage: pnpm migrate [options]

Copies Universer data (Universer 1.6.2, PostgreSQL) into the Univer Collaboration
PostgreSQL + S3 database adapter. See README for the procedure.

Source (Universer)
  --source-database-url <url>   or UNIVERSER_DATABASE_URL
  --source-s3-endpoint <url>    or UNIVERSER_S3_ENDPOINT
  --source-s3-region <region>   or UNIVERSER_S3_REGION      (default us-east-1)
  --source-s3-bucket <name>     or UNIVERSER_S3_BUCKET      (default univer)
  --source-s3-path-style        or UNIVERSER_S3_PATH_STYLE  (default false; set true for MinIO)
                                UNIVERSER_S3_ACCESS_KEY_ID, UNIVERSER_S3_SECRET_ACCESS_KEY

Target (Univer Collaboration)
  --target-database-url <url>   or TARGET_DATABASE_URL
  --target-s3-endpoint <url>    or TARGET_S3_ENDPOINT
  --target-s3-region <region>   or TARGET_S3_REGION         (default us-east-1)
  --target-s3-bucket <name>     or TARGET_S3_BUCKET
  --target-s3-path-style        or TARGET_S3_PATH_STYLE     (default false; set true for MinIO)
  --target-block-prefix <path>  or TARGET_BLOCK_PREFIX
                                TARGET_S3_ACCESS_KEY_ID, TARGET_S3_SECRET_ACCESS_KEY

Run
  --unit <id>                   migrate only this unit (repeatable)
  --concurrency <n>             units migrated at the same time (default 4)
  --dry-run                     read and rebuild the source only, write nothing
  --no-verify                   skip replaying each migrated unit to its head
  --no-block-dedupe             store every snapshot's blocks as Universer did
  --default-creator <id>        creator for units without one (default universer-migration)
  --manifest <path>             result file (default universer-migration-manifest.jsonl)
  -h, --help
`;

function main(): Promise<number> {
  const { values } = parseArgs({
    options: {
      "source-database-url": { type: "string" },
      "source-s3-endpoint": { type: "string" },
      "source-s3-region": { type: "string" },
      "source-s3-bucket": { type: "string" },
      "source-s3-path-style": { type: "boolean" },
      "target-database-url": { type: "string" },
      "target-s3-endpoint": { type: "string" },
      "target-s3-region": { type: "string" },
      "target-s3-bucket": { type: "string" },
      "target-s3-path-style": { type: "boolean" },
      "target-block-prefix": { type: "string" },
      unit: { type: "string", multiple: true },
      concurrency: { type: "string" },
      "dry-run": { type: "boolean" },
      "no-verify": { type: "boolean" },
      "no-block-dedupe": { type: "boolean" },
      "default-creator": { type: "string" },
      manifest: { type: "string" },
      help: { type: "boolean", short: "h" },
    },
  });
  if (values.help) {
    process.stdout.write(HELP);
    return Promise.resolve(0);
  }
  const env = process.env;
  const s3 = (
    prefix: "UNIVERSER" | "TARGET",
    endpoint?: string,
    region?: string,
    bucket?: string,
    pathStyle?: boolean,
  ): S3Location => {
    const accessKeyId = env[`${prefix}_S3_ACCESS_KEY_ID`];
    const secretAccessKey = env[`${prefix}_S3_SECRET_ACCESS_KEY`];
    const resolvedEndpoint = endpoint ?? env[`${prefix}_S3_ENDPOINT`];
    const pathStyleEnv = `${prefix}_S3_PATH_STYLE`;
    return {
      region: region ?? env[`${prefix}_S3_REGION`] ?? "us-east-1",
      bucket: bucket ?? env[`${prefix}_S3_BUCKET`] ?? (prefix === "UNIVERSER" ? "univer" : ""),
      forcePathStyle: pathStyle ?? parseBooleanEnv(pathStyleEnv, env[pathStyleEnv]) ?? false,
      ...(resolvedEndpoint ? { endpoint: resolvedEndpoint } : {}),
      ...(accessKeyId ? { accessKeyId } : {}),
      ...(secretAccessKey ? { secretAccessKey } : {}),
    };
  };
  const blockPrefix = values["target-block-prefix"] ?? env["TARGET_BLOCK_PREFIX"];
  const config: MigrationConfig = {
    source: {
      databaseUrl: values["source-database-url"] ?? env["UNIVERSER_DATABASE_URL"] ?? "",
      s3: s3(
        "UNIVERSER",
        values["source-s3-endpoint"],
        values["source-s3-region"],
        values["source-s3-bucket"],
        values["source-s3-path-style"],
      ),
    },
    target: {
      databaseUrl: values["target-database-url"] ?? env["TARGET_DATABASE_URL"] ?? "",
      s3: s3(
        "TARGET",
        values["target-s3-endpoint"],
        values["target-s3-region"],
        values["target-s3-bucket"],
        values["target-s3-path-style"],
      ),
      ...(blockPrefix ? { blockPrefix } : {}),
    },
    unitIDs: values.unit ?? [],
    concurrency: Number(values.concurrency ?? 4),
    dryRun: values["dry-run"] ?? false,
    verify: !(values["no-verify"] ?? false),
    blockDedupe: !(values["no-block-dedupe"] ?? false),
    defaultCreatorID: values["default-creator"] ?? "universer-migration",
    manifestPath: values.manifest ?? "universer-migration-manifest.jsonl",
  };

  return runMigration(config, (result, done, total) => {
    const detail = result.status === "failed" ? ` – ${result.error}` : result.reason ? ` – ${result.reason}` : "";
    const deleted = result.softDeleted ? " (in trash)" : "";
    process.stdout.write(`[${done}/${total}] ${result.unitID} ${result.status}${deleted}${detail}\n`);
  }).then((summary) => {
    process.stdout.write(`\nUnits: ${summary.total}  ${JSON.stringify(summary.byStatus)}\n`);
    if (summary.hardDeleted.length) {
      process.stdout.write(`Permanently deleted in Universer, keep these IDs reserved: ${summary.hardDeleted.length}\n`);
    }
    process.stdout.write(`Manifest: ${config.manifestPath}\n`);
    return summary.failed.length ? 1 : 0;
  });
}

main().then(
  (code) => process.exit(code),
  (error: unknown) => {
    process.stderr.write(`Migration stopped: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(2);
  },
);
