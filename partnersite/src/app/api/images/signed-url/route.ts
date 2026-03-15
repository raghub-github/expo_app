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

/**
 * GET /api/images/signed-url?key=merchant-assets/GMMC1002/banners/banners_123.png
 * Generates a signed URL for an R2 object key (valid for 7 days).
 * Use this when displaying images stored in merchant_stores (banner_url, gallery_images, etc.).
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const key = searchParams.get('key');
    const url = searchParams.get('url'); // If full URL provided, extract key

    if (!key && !url) {
      return NextResponse.json({ error: 'key or url parameter required' }, { status: 400 });
    }

    if (!process.env.R2_BUCKET_NAME) {
      return NextResponse.json({ error: 'R2_BUCKET_NAME not configured' }, { status: 500 });
    }

    let objectKey = key ? decodeURIComponent(key) : '';

    // If URL provided, extract key from it
    if (!objectKey && url) {
      try {
        // Proxy URL: /api/attachments/proxy?key=... (key is the full R2 key, e.g. docs/merchants/...)
        if (url.includes('attachments/proxy') && url.includes('key=')) {
          const urlObj = new URL(url, 'https://dummy');
          const keyParam = urlObj.searchParams.get('key');
          if (keyParam) objectKey = decodeURIComponent(keyParam);
        }
        if (!objectKey) {
          const urlObj = new URL(url);
          objectKey = urlObj.pathname.replace(/^\/+/, '');
          if (url.includes('r2.cloudflarestorage.com')) {
            objectKey = urlObj.pathname.replace(/^\/+/, '');
          }
        }
        if (!objectKey) {
          const match = url.match(/(?:docs\/merchants|merchant-assets|merchants)\/.+$/);
          if (match) objectKey = match[0];
        }
      } catch {
        const match = url.match(/(?:docs\/merchants|merchant-assets|merchants)\/.+$/);
        if (match) objectKey = match[0];
      }
    }

    if (!objectKey) {
      return NextResponse.json({ error: 'Could not extract key from URL' }, { status: 400 });
    }

    const command = new GetObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: objectKey,
    });

    const signedUrl = await getSignedUrl(s3Client, command, { expiresIn: 60 * 60 * 24 * 7 }); // 7 days - auto-renew on each request when using redirect

    const redirect = searchParams.get('redirect');
    if (redirect === '1' || redirect === 'true') {
      return NextResponse.redirect(signedUrl, 302);
    }
    return NextResponse.json({ url: signedUrl, key: objectKey });
  } catch (err: any) {
    console.error('[signed-url]', err);
    return NextResponse.json({ error: err?.message || 'Failed to generate signed URL' }, { status: 500 });
  }
}
