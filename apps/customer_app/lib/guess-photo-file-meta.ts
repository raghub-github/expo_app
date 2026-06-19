export function guessPhotoFileMeta(uri: string, index: number): { name: string; mimeType: string } {
  const lower = uri.toLowerCase();
  if (lower.includes(".png")) return { name: `photo-${index + 1}.png`, mimeType: "image/png" };
  if (lower.includes(".webp")) return { name: `photo-${index + 1}.webp`, mimeType: "image/webp" };
  if (lower.includes(".gif")) return { name: `photo-${index + 1}.gif`, mimeType: "image/gif" };
  return { name: `photo-${index + 1}.jpg`, mimeType: "image/jpeg" };
}
