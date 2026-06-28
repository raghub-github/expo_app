/** Customer → rider chat message with Google Maps turn-by-turn navigation deep link. */
export function formatChatSharedLocationMessage(
  lead: string,
  label: string,
  lat: number,
  lng: number
): string {
  const navUrl = buildGoogleMapsNavigationUrl(lat, lng);
  return `${lead.trim()}\n📍 ${label.trim()}\n${navUrl}`;
}

export function buildGoogleMapsNavigationUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving&dir_action=navigate`;
}
