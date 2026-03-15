/**
 * GET /api/attachments/proxy?url=<encoded-url>  OR  ?key=<encoded-r2-key>
 *
 * Serves R2 objects on demand so attachments never show expiry errors.
 * - ?key=: R2 object key (e.g. docs/merchants/GMMP1005/stores/GMMC1017/onboarding/documents/pan/file.pdf). Preferred.
 * - ?url=: Full R2 URL; key is extracted from pathname. Keeps existing stored URLs working.
 *
 * Every request fetches the object from R2 using server credentials and streams it to the client.
 * There is no signed URL sent to the client — so no expiry. Access is effectively "auto-renewed"
 * on every view (images, PDFs, CSV, contracts, etc.). Use this URL format in the DB for all attachments.
 */

import { NextRequest, NextResponse } from "next/server";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";

function getR2Client(): S3Client {
  return new S3Client({
    region: process.env.R2_REGION || "auto",
    endpoint: process.env.R2_ENDPOINT,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY!,
      secretAccessKey: process.env.R2_SECRET_KEY!,
    },
  });
}

/** Extract R2 key from a full URL (pathname without leading slash). */
function keyFromUrl(decodedUrl: string): string | null {
  try {
    if (decodedUrl.startsWith("http://") || decodedUrl.startsWith("https://")) {
      const u = new URL(decodedUrl);
      const k = u.pathname.replace(/^\/+/, "");
      return k || null;
    }
  } catch {
    return null;
  }
  return null;
}

/** Allow only our R2-related URLs for security. */
function isAllowedR2Url(decodedUrl: string): boolean {
  const base = process.env.R2_PUBLIC_BASE_URL?.replace(/\/$/, "") ?? "";
  if (base && (decodedUrl.startsWith(base + "/") || decodedUrl === base)) return true;
  if (/\.r2\.cloudflarestorage\.com/i.test(decodedUrl)) return true;
  if (/\.r2\.dev/i.test(decodedUrl)) return true;
  return false;
}

export async function GET(request: NextRequest) {
  try {
    const keyParam = request.nextUrl.searchParams.get("key");
    const urlParam = request.nextUrl.searchParams.get("url");

    let key: string | null = null;

    if (keyParam?.trim()) {
      try {
        key = decodeURIComponent(keyParam.trim());
      } catch {
        return NextResponse.json({ error: "Invalid key parameter" }, { status: 400 });
      }
    } else if (urlParam?.trim()) {
      let decodedUrl: string;
      try {
        decodedUrl = decodeURIComponent(urlParam.trim());
      } catch {
        return NextResponse.json({ error: "Invalid url parameter" }, { status: 400 });
      }
      if (!isAllowedR2Url(decodedUrl)) {
        return NextResponse.json({ error: "URL not allowed" }, { status: 403 });
      }
      key = keyFromUrl(decodedUrl);
    }

    if (!key?.trim()) {
      return NextResponse.json({ error: "Missing key or url parameter" }, { status: 400 });
    }

    const bucket = process.env.R2_BUCKET_NAME;
    if (!bucket || !process.env.R2_ACCESS_KEY || !process.env.R2_SECRET_KEY || !process.env.R2_ENDPOINT) {
      return NextResponse.json(
        { error: "R2 not configured" },
        { status: 500 }
      );
    }

    const client = getR2Client();
    const objectKey = key.trim();
    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: objectKey,
    });
    const response = await client.send(command);

    if (!response.Body) {
      return NextResponse.json({ error: "Empty object" }, { status: 404 });
    }

    const contentType = response.ContentType ?? "application/octet-stream";
    const headers = new Headers();
    headers.set("Content-Type", contentType);
    headers.set("Cache-Control", "private, max-age=3600");
    if (response.ContentLength != null) {
      headers.set("Content-Length", String(response.ContentLength));
    }
    headers.set("Access-Control-Allow-Origin", "*");

    return new NextResponse(response.Body as any, {
      status: 200,
      headers,
    });
  } catch (err: any) {
    if (err?.name === "NoSuchKey") {
      const bucket = process.env.R2_BUCKET_NAME;
      const keyParam = request.nextUrl.searchParams.get("key");
      let key: string | null = keyParam ? decodeURIComponent(keyParam.trim()) : null;

      const tryKey = async (objectKey: string): Promise<NextResponse | null> => {
        try {
          const client = getR2Client();
          const response = await client.send(
            new GetObjectCommand({ Bucket: bucket!, Key: objectKey })
          );
          if (response.Body) {
            const contentType = response.ContentType ?? "application/octet-stream";
            const headers = new Headers();
            headers.set("Content-Type", contentType);
            headers.set("Cache-Control", "private, max-age=3600");
            if (response.ContentLength != null) headers.set("Content-Length", String(response.ContentLength));
            headers.set("Access-Control-Allow-Origin", "*");
            return new NextResponse(response.Body as any, { status: 200, headers });
          }
        } catch (e: any) {
          if (e?.name !== "NoSuchKey") console.error("[attachments/proxy] Retry Error:", e);
        }
        return null;
      };

      if (key && bucket) {
        if (key.startsWith(bucket + "/")) {
          const res = await tryKey(key.slice(bucket.length + 1));
          if (res) return res;
        }
        // Menu sheet keys from onboarding often stored without extension; R2 may have .csv
        if (/\/menu_sheet_\d+$/.test(key)) {
          const res = await tryKey(key + ".csv");
          if (res) return res;
        }
      }
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    console.error("[attachments/proxy] Error:", err);
    return NextResponse.json(
      { error: "Failed to load attachment" },
      { status: 500 }
    );
  }
}

export function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400",
    },
  });
}
