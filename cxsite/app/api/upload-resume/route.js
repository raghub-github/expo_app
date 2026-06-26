import { NextResponse } from 'next/server';

// You need to install @aws-sdk/client-s3 for this to work
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

// These should be set in your .env.local
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_KEY;
const R2_BUCKET = process.env.R2_BUCKET_NAME;
const R2_ENDPOINT = process.env.R2_ENDPOINT; // e.g. https://<accountid>.r2.cloudflarestorage.com

const s3 = new S3Client({
  region: 'auto',
  endpoint: R2_ENDPOINT,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
});

export async function POST(req) {
  try {
    const formData = await req.formData();
    const file = formData.get('file');
    if (!file) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    }
    const buffer = Buffer.from(await file.arrayBuffer());
    const fileName = `${Date.now()}-${file.name}`;

    // Upload to R2
    await s3.send(new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: fileName,
      Body: buffer,
      ContentType: file.type,
    }));

    // Get signed URL (valid for 10 minutes)
    const signedUrl = await getSignedUrl(
      s3,
      new PutObjectCommand({
        Bucket: R2_BUCKET,
        Key: fileName,
      }),
      { expiresIn: 600 }
    );

    return NextResponse.json({ signedUrl });
  } catch (err) {
    return NextResponse.json({ error: err.message || 'Upload failed' }, { status: 500 });
  }
}
