import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import type { S3Location } from "./config.js";

export function createS3Client(location: S3Location): S3Client {
  return new S3Client({
    region: location.region,
    forcePathStyle: location.forcePathStyle,
    // Keep compatibility with S3-compatible services (Aliyun OSS, R2, older MinIO) that reject the
    // default request checksums added by newer AWS SDK v3 releases, while still sending checksums
    // when an operation requires them.
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
    ...(location.endpoint ? { endpoint: location.endpoint } : {}),
    ...(location.accessKeyId && location.secretAccessKey
      ? { credentials: { accessKeyId: location.accessKeyId, secretAccessKey: location.secretAccessKey } }
      : {}),
  });
}

/** Reads whole objects from the Universer bucket. */
export class UniverserBlobStore {
  constructor(
    private readonly _client: S3Client,
    private readonly _bucket: string,
  ) {}

  async read(key: string): Promise<Uint8Array> {
    const result = await this._client.send(new GetObjectCommand({ Bucket: this._bucket, Key: key }));
    if (!result.Body) throw new Error(`Object ${key} has no body`);
    return result.Body.transformToByteArray();
  }
}
