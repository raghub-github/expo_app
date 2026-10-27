import "server-only";

import { GetObjectCommand, HeadObjectCommand, S3Client } from "@aws-sdk/client-s3";
import type { Readable } from "stream";

let client: S3Client | null = null;

function getClient() {
  if (client) return client;
  const accountId = process.env.R2_ACCOUNT_ID?.trim();
  const accessKey = process.env.R2_ACCESS_KEY?.trim();
  const secretKey = process.env.R2_SECRET_KEY?.trim();
  const endpoint =
    process.env.R2_ENDPOINT?.trim() ||
    (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : "");
  if (!endpoint || !accessKey || !secretKey) {
    throw new Error("R2 credentials are not configured");
  }
  client = new S3Client({
    region: process.env.R2_REGION?.trim() || "auto",
    endpoint,
    credentials: { accessKeyId: accessKey, secretAccessKey: secretKey },
    forcePathStyle: true,
    requestHandler: undefined,
  });
  return client;
}

function bucket() {
  const b = process.env.R2_BUCKET_NAME?.trim();
  if (!b) throw new Error("R2_BUCKET_NAME is not configured");
  return b;
}

export function normalizeMediaKey(raw: string): string {
  let key = raw.trim();
  if (!key) return "";
  if (key.startsWith("http://") || key.startsWith("https://")) {
    try {
      const u = new URL(key);
      if (u.pathname.includes("/attachments/proxy")) {
        return (u.searchParams.get("key") || "").trim();
      }
      key = decodeURIComponent(u.pathname.replace(/^\/+/, ""));
      const first = key.split("/")[0];
      if (first && !first.includes(".") && first === process.env.R2_BUCKET_NAME?.trim()) {
        key = key.split("/").slice(1).join("/");
      }
    } catch {
      return "";
    }
  }
  return key.replace(/^\/+/, "");
}

function isMissingObject(error: unknown): boolean {
  const name = String((error as { name?: string } | null)?.name ?? "");
  const http = Number(
    (error as { $metadata?: { httpStatusCode?: number } } | null)?.$metadata?.httpStatusCode
  );
  return name === "NoSuchKey" || name === "NotFound" || http === 404;
}

/** Full buffer — prefer getR2ObjectStream for large avatars/docs. */
export async function getR2Object(keyRaw: string) {
  const key = normalizeMediaKey(keyRaw);
  if (!key) return null;
  try {
    const res = await getClient().send(
      new GetObjectCommand({ Bucket: bucket(), Key: key })
    );
    if (!res.Body) return null;
    const bytes = await res.Body.transformToByteArray();
    return {
      buffer: Buffer.from(bytes),
      contentType: res.ContentType || null,
    };
  } catch (error) {
    if (isMissingObject(error)) return null;
    throw error;
  }
}

/** Stream R2 body so nginx does not wait for the whole object before first byte. */
export async function getR2ObjectStream(keyRaw: string) {
  const key = normalizeMediaKey(keyRaw);
  if (!key) return null;
  try {
    const res = await getClient().send(
      new GetObjectCommand({ Bucket: bucket(), Key: key })
    );
    if (!res.Body) return null;
    const body = res.Body as {
      transformToWebStream?: () => ReadableStream;
      transformToByteArray?: () => Promise<Uint8Array>;
    } & Readable;
    let stream: ReadableStream<Uint8Array>;
    if (typeof body.transformToWebStream === "function") {
      stream = body.transformToWebStream();
    } else {
      const { Readable: NodeReadable } = await import("stream");
      stream = NodeReadable.toWeb(body as InstanceType<typeof NodeReadable>) as ReadableStream<Uint8Array>;
    }
    return {
      stream,
      contentType: res.ContentType || null,
      contentLength: typeof res.ContentLength === "number" ? res.ContentLength : null,
    };
  } catch (error) {
    if (isMissingObject(error)) return null;
    throw error;
  }
}

export async function headR2Object(keyRaw: string) {
  const key = normalizeMediaKey(keyRaw);
  if (!key) return null;
  try {
    const res = await getClient().send(
      new HeadObjectCommand({ Bucket: bucket(), Key: key })
    );
    return {
      contentType: res.ContentType || null,
      contentLength: typeof res.ContentLength === "number" ? res.ContentLength : null,
    };
  } catch (error) {
    if (isMissingObject(error)) return null;
    throw error;
  }
}

export function contentTypeFromKey(key: string, fallback: string | null) {
  if (fallback) return fallback;
  const lower = key.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  return "application/octet-stream";
}
