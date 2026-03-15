import { NextRequest, NextResponse } from 'next/server';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const s3Client = new S3Client({
  region: process.env.R2_REGION || 'auto',
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY!,
    secretAccessKey: process.env.R2_SECRET_KEY!,
  },
});

const DEFAULT_EXPIRY_SEC = 60 * 60 * 24 * 7; // 7 days

/**
 * GET /api/media/renew-signed-url?fileKey=<key>
 * Optional: ?url=<encoded-url> to extract key from a full R2/signed URL (legacy).
 * Returns a fresh signed URL for the R2 object. Use for auto-renewal when images fail or expire.
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    let fileKey = searchParams.get('fileKey') ?? searchParams.get('key') ?? '';
    const urlParam = searchParams.get('url');

    if (!fileKey && !urlParam) {
      return NextResponse.json({ error: 'fileKey or url parameter required' }, { status: 400 });
    }

    if (!process.env.R2_BUCKET_NAME) {
      return NextResponse.json({ error: 'R2_BUCKET_NAME not configured' }, { status: 500 });
    }

    if (!fileKey && urlParam) {
      try {
        const decoded = decodeURIComponent(urlParam);
        const urlObj = new URL(decoded);
        let path = urlObj.pathname.replace(/^\/+/, '');
        // Strip bucket prefix if path is like /bucket-name/menuitems/...
        const bucket = process.env.R2_BUCKET_NAME;
        if (bucket && path.startsWith(bucket + '/')) {
          path = path.slice(bucket.length + 1);
        }
        if (path) fileKey = path;
        if (!fileKey) {
          const match = decoded.match(/(?:menuitems|categories|merchant-assets|tickets|merchants)\/[^\s?]+/);
          if (match) fileKey = match[0];
        }
      } catch {
        const match = urlParam.match(/(?:menuitems|categories|merchant-assets|tickets|merchants)\/[^\s&]+/);
        if (match) fileKey = decodeURIComponent(match[0]);
      }
    }

    if (!fileKey) {
      return NextResponse.json({ error: 'Could not resolve file key' }, { status: 400 });
    }

    const command = new GetObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: fileKey,
    });

    const signedUrl = await getSignedUrl(s3Client, command, { expiresIn: DEFAULT_EXPIRY_SEC });

    return NextResponse.json({ signedUrl });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to generate signed URL';
    console.error('[renew-signed-url]', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
