// Migration configuration. The CLI builds it from flags and environment variables; every other module
// receives the parts it needs and never reads the environment itself.

/** An S3-compatible bucket and the credentials to reach it. */
export interface S3Location {
  readonly endpoint?: string;
  readonly region: string;
  readonly bucket: string;
  readonly accessKeyId?: string;
  readonly secretAccessKey?: string;
  /**
   * Path-style addressing, matching Universer's `usePathStyle` (default `false` for AWS S3,
   * Aliyun OSS and other virtual-hosted stores; set `true` for MinIO and self-hosted stores that
   * require path-style URLs).
   */
  readonly forcePathStyle: boolean;
}

/** Everything `runMigration` needs. Nothing is read from the environment. */
export interface MigrationConfig {
  readonly source: {
    /** Universer PostgreSQL. A read-only account is enough. */
    readonly databaseUrl: string;
    /** Bucket holding Universer Sheet blocks and uploaded files (`S3_DEFAULT_BUCKET`). */
    readonly s3: S3Location;
  };
  readonly target: {
    /** PostgreSQL used by the SDK adapters; the `collaboration` schema is created on first use. */
    readonly databaseUrl: string;
    /** Bucket for SDK Sheet blocks. */
    readonly s3: S3Location;
    /** Key prefix of the SDK Sheet blocks, as configured for the adapter. */
    readonly blockPrefix?: string;
  };
  /** Migrate only these Units; all Units when empty. */
  readonly unitIDs: readonly string[];
  /** Units migrated at the same time. */
  readonly concurrency: number;
  /** Read, rebuild and check the source without writing the target. */
  readonly dryRun: boolean;
  /** Reuse an earlier block ID when a later snapshot stores identical block content. */
  readonly blockDedupe: boolean;
  /** Replay every migrated Unit to its head with the SDK runtime. */
  readonly verify: boolean;
  /** Creator recorded when the Universer creator is empty (deployments without authentication). */
  readonly defaultCreatorID: string;
  /** JSON Lines file, one line per Unit. */
  readonly manifestPath: string;
}

export function validateConfig(config: MigrationConfig): void {
  if (!config.source.databaseUrl) throw new Error("Source database URL is required");
  if (!config.source.s3.bucket) throw new Error("Source bucket is required");
  validateS3Credentials("Source", config.source.s3);
  if (!config.dryRun) {
    if (!config.target.databaseUrl) throw new Error("Target database URL is required");
    if (!config.target.s3.bucket) throw new Error("Target bucket is required");
    validateS3Credentials("Target", config.target.s3);
  }
  if (!Number.isSafeInteger(config.concurrency) || config.concurrency < 1) {
    throw new Error("Concurrency must be a positive integer");
  }
  if (!config.defaultCreatorID) throw new Error("Default creator ID must not be empty");
}

function validateS3Credentials(side: string, s3: S3Location): void {
  if (Boolean(s3.accessKeyId) !== Boolean(s3.secretAccessKey)) {
    throw new Error(`${side} S3 access key ID and secret access key must be set together`);
  }
}

/** Parses an optional boolean environment variable (`true`/`1` or `false`/`0`). */
export function parseBooleanEnv(name: string, value: string | undefined): boolean | undefined {
  if (value === undefined || value === "") return undefined;
  const normalized = value.trim().toLowerCase();
  if (normalized === "true" || normalized === "1") return true;
  if (normalized === "false" || normalized === "0") return false;
  throw new Error(`${name} must be true, false, 1 or 0 (got "${value}")`);
}
