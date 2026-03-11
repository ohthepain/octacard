import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { traceAwsCall } from "./external-api-trace.js";

const region = process.env.AWS_REGION ?? "eu-central-1";
const bucket = process.env.S3_BUCKET ?? "octacard-staging-uploads";
const endpoint = process.env.S3_ENDPOINT || undefined;

export const s3Client = new S3Client({
  region,
  ...(endpoint && {
    endpoint,
    forcePathStyle: true,
  }),
  credentials:
    process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
      ? {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        }
      : undefined,
});

export { bucket };

export async function uploadToS3(
  key: string,
  body: Buffer | Uint8Array | string,
  contentType?: string
): Promise<string> {
  await traceAwsCall(
    { service: "aws-s3", operation: "PutObject", target: `s3://${bucket}/${key}` },
    () =>
      s3Client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: body,
          ContentType: contentType,
        })
      )
  );
  return key;
}

export async function getFromS3(key: string): Promise<Buffer | null> {
  try {
    const res = await traceAwsCall(
      { service: "aws-s3", operation: "GetObject", target: `s3://${bucket}/${key}` },
      () => s3Client.send(new GetObjectCommand({ Bucket: bucket, Key: key }))
    );
    if (!res.Body) return null;
    return Buffer.from(await res.Body.transformToByteArray());
  } catch {
    return null;
  }
}

export async function deleteFromS3(key: string): Promise<void> {
  await traceAwsCall(
    { service: "aws-s3", operation: "DeleteObject", target: `s3://${bucket}/${key}` },
    () => s3Client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }))
  );
}

export async function existsInS3(key: string): Promise<boolean> {
  try {
    await traceAwsCall(
      { service: "aws-s3", operation: "HeadObject", target: `s3://${bucket}/${key}` },
      () => s3Client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }))
    );
    return true;
  } catch {
    return false;
  }
}

export async function getPresignedUploadUrl(
  key: string,
  contentType: string,
  expiresIn = 3600
): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    ContentType: contentType,
  });
  return getSignedUrl(s3Client, command, { expiresIn });
}

export async function getPresignedDownloadUrl(
  key: string,
  expiresIn = 3600
): Promise<string> {
  const command = new GetObjectCommand({ Bucket: bucket, Key: key });
  return getSignedUrl(s3Client, command, { expiresIn });
}
