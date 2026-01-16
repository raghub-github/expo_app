import { supabase } from './supabase';

export async function uploadImageToR2(file: File, folder: string, storeId: string, bucket = 'merchant-assets'): Promise<string | null> {
  const fileExt = file.name.split('.').pop();
  const filePath = `${folder}/${storeId}_${Date.now()}.${fileExt}`;
  const { data, error } = await supabase.storage.from(bucket).upload(filePath, file, {
    cacheControl: '3600',
    upsert: true,
  });
  if (error) {
    console.error('R2 upload error:', error);
    return null;
  }
  // Get a signed URL for the uploaded file
  const { data: urlData, error: urlError } = await supabase.storage.from(bucket).createSignedUrl(filePath, 60 * 60 * 24 * 7); // 7 days
  if (urlError || !urlData?.signedUrl) {
    console.error('Signed URL error:', urlError);
    return null;
  }
  return urlData.signedUrl;
}
