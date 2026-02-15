/**
 * GET /api/attachments/proxy?url=<encoded-url>
 *
 * Proxies R2 object by URL so private bucket attachments can be displayed.
 * Only URLs under R2_PUBLIC_BASE_URL are allowed.
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

export async function GET(request: NextRequest) {
  try {
    const urlParam = request.nextUrl.searchParams.get("url");
    if (!urlParam?.trim()) {
      return NextResponse.json({ error: "Missing url parameter" }, { status: 400 });
    }

    let decodedUrl: string;
    try {
      decodedUrl = decodeURIComponent(urlParam.trim());
    } catch {
      return NextResponse.json({ error: "Invalid url parameter" }, { status: 400 });
    }

    const baseUrl = process.env.R2_PUBLIC_BASE_URL?.replace(/\/$/, "") ?? "";
    if (!baseUrl) {
      return NextResponse.json(
        { error: "R2 not configured" },
        { status: 500 }
      );
    }

    if (!decodedUrl.startsWith(baseUrl + "/") && decodedUrl !== baseUrl) {
      return NextResponse.json(
        { error: "URL not allowed" },
        { status: 403 }
      );
    }

    const key = decodedUrl.slice(baseUrl.length).replace(/^\//, "");
    if (!key) {
      return NextResponse.json({ error: "Invalid key" }, { status: 400 });
    }

    const bucket = process.env.R2_BUCKET_NAME;
    if (!bucket || !process.env.R2_ACCESS_KEY || !process.env.R2_SECRET_KEY || !process.env.R2_ENDPOINT) {
      return NextResponse.json(
        { error: "R2 not configured" },
        { status: 500 }
      );
    }

    const client = getR2Client();
    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: key,
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
