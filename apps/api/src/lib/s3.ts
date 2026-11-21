import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { Env } from '../config/env';
import { requireS3 } from '../config/env';

export function createS3Client(env: Env): S3Client {
  const cfg = requireS3(env);
  return new S3Client({
    region: cfg.S3_REGION,
    endpoint: cfg.S3_ENDPOINT,
    forcePathStyle: cfg.S3_FORCE_PATH_STYLE,
    credentials: {
      accessKeyId: cfg.S3_ACCESS_KEY_ID!,
      secretAccessKey: cfg.S3_SECRET_ACCESS_KEY!,
    },
  });
}

export function incomingKey(tenantId: string, assetId: string): string {
  return `incoming/${tenantId}/${assetId}`;
}

export function readyKey(tenantId: string, assetId: string): string {
  return `tenants/${tenantId}/media/${assetId}/original.mp4`;
}

export function globalReadyKey(assetId: string): string {
  return `global/media/${assetId}/original.mp4`;
}

export async function presignPut(
  client: S3Client,
  env: Env,
  key: string,
  contentType: string,
): Promise<string> {
  return getSignedUrl(
    client,
    new PutObjectCommand({
      Bucket: env.S3_BUCKET,
      Key: key,
      ContentType: contentType,
    }),
    { expiresIn: env.MEDIA_UPLOAD_URL_TTL_SECONDS },
  );
}

export async function presignGet(client: S3Client, env: Env, key: string): Promise<string> {
  return getSignedUrl(
    client,
    new GetObjectCommand({
      Bucket: env.S3_BUCKET,
      Key: key,
    }),
    { expiresIn: env.MEDIA_PLAYBACK_URL_TTL_SECONDS },
  );
}

export async function headObject(client: S3Client, env: Env, key: string) {
  return client.send(
    new HeadObjectCommand({
      Bucket: env.S3_BUCKET,
      Key: key,
    }),
  );
}

export async function getObjectBytes(
  client: S3Client,
  env: Env,
  key: string,
  maxBytes: number,
): Promise<Buffer> {
  const response = await client.send(
    new GetObjectCommand({
      Bucket: env.S3_BUCKET,
      Key: key,
    }),
  );
  const body = response.Body;
  if (!body) throw new Error('empty_object');
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of body as AsyncIterable<Uint8Array>) {
    total += chunk.byteLength;
    if (total > maxBytes) throw new Error('object_too_large');
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

export async function moveObject(
  client: S3Client,
  env: Env,
  fromKey: string,
  toKey: string,
): Promise<void> {
  await client.send(
    new CopyObjectCommand({
      Bucket: env.S3_BUCKET,
      CopySource: `${env.S3_BUCKET}/${fromKey}`,
      Key: toKey,
    }),
  );
  await client.send(
    new DeleteObjectCommand({
      Bucket: env.S3_BUCKET,
      Key: fromKey,
    }),
  );
}

export async function deleteObject(client: S3Client, env: Env, key: string): Promise<void> {
  await client.send(
    new DeleteObjectCommand({
      Bucket: env.S3_BUCKET,
      Key: key,
    }),
  );
}
