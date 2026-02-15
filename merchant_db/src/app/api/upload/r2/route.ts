import { NextRequest, NextResponse } from 'next/server';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { supabase } from '@/lib/supabase';

// ---------- R2 Client ----------
const s3Client = new S3Client({
  region: process.env.R2_REGION || 'auto',
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY!,
    secretAccessKey: process.env.R2_SECRET_KEY!,
  },
});

// ---------- POST Handler ----------
export async function POST(request: NextRequest) {
  try {
    // -------- Validate ENV --------
    if (
      !process.env.R2_BUCKET_NAME ||
      !process.env.R2_PUBLIC_BASE_URL ||
      !process.env.R2_ENDPOINT ||
      !process.env.R2_ACCESS_KEY ||
      !process.env.R2_SECRET_KEY
    ) {
      return NextResponse.json(
        { error: 'R2 environment variables missing' },
        { status: 500 }
      );
    }

    const formData = await request.formData();

    const file = formData.get('file') as File | null;
    const parent = formData.get('parent') as string | null;
    const filename = formData.get('filename') as string | null;
    const menu_item_id = formData.get('menu_item_id') as string | null;

    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      );
    }

    // -------- Build Path --------
    const safeFileName = filename || file.name;
    const fullPath = parent ? `${parent}/${safeFileName}` : safeFileName;

    // -------- Convert File --------
    const buffer = Buffer.from(await file.arrayBuffer());

    // -------- Upload to R2 --------
    const uploadCommand = new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: fullPath,
      Body: buffer,
      ContentType: file.type,
    });

    await s3Client.send(uploadCommand);

    // -------- Public URL --------
    const publicUrl = `${process.env.R2_PUBLIC_BASE_URL}/${fullPath}`;

    // -------- Update Supabase (Optional) --------
    if (menu_item_id) {
      const { error } = await supabase
        .from('menu_items')
        .update({
          image_url: publicUrl,
          updated_at: new Date().toISOString(),
        })
        .eq('item_id', menu_item_id);

      if (error) {
        console.error('Supabase update failed:', error);
        return NextResponse.json(
          {
            error: 'Upload succeeded but DB update failed',
            details: error.message,
          },
          { status: 500 }
        );
      }
    }

    // -------- Success --------
    return NextResponse.json({
      success: true,
      url: publicUrl,
      path: fullPath,
    });

  } catch (err: any) {
    console.error('Upload Error:', err);
    return NextResponse.json(
      {
        error: 'Upload failed',
        details: err?.message || 'Unknown error',
      },
      { status: 500 }
    );
  }
}
