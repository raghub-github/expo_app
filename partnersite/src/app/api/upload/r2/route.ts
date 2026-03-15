import { NextRequest, NextResponse } from 'next/server';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
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

    // -------- Generate signed URL (valid for 7 days) --------
    const getObjectCommand = new GetObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: fullPath,
    });
    const signedUrl = await getSignedUrl(s3Client, getObjectCommand, { expiresIn: 60 * 60 * 24 * 7 }); // 7 days
    
    // For ticket attachments, return key so Supabase can store key and proxy can serve (no auth/expiry issues).
    const isTicketAttachment = typeof parent === "string" && parent.startsWith("tickets/");

    // -------- Update Supabase (Optional) --------
    // Only update DB when parent is a known flow that uses a table we have (e.g. tickets).
    // Menu items (parent 'menuitems') and categories use their own APIs to save the returned key.
    // The table 'menu_items' does not exist in this schema; avoid touching it.
    const isTicketFlow = typeof parent === 'string' && parent.startsWith('tickets/');
    if (menu_item_id && isTicketFlow) {
      const { error } = await supabase
        .from('menu_items')
        .update({
          image_url: signedUrl,
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
      url: isTicketAttachment ? fullPath : signedUrl,
      path: fullPath,
      key: fullPath, // Always return key for future signed URL generation
      ...(isTicketAttachment ? { key: fullPath } : {}),
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
