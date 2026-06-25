export type ChatSharedLocation = {
  lat: number;
  lng: number;
  label?: string;
  leadText?: string;
};

function isValidCoord(lat: number, lng: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lng) <= 180 &&
    !(lat === 0 && lng === 0)
  );
}

function parseCoordPair(a: string, b: string): ChatSharedLocation | null {
  const lat = Number(a.trim());
  const lng = Number(b.trim());
  if (!isValidCoord(lat, lng)) return null;
  return { lat, lng };
}

function parseCoordsFromParam(value: string): ChatSharedLocation | null {
  const decoded = decodeURIComponent(value.trim());
  const parts = decoded.split(/[,|%2C]/i).map((p) => p.trim());
  if (parts.length < 2) return null;
  return parseCoordPair(parts[0], parts[1]);
}

function parseCoordsFromMapsUrl(urlText: string): ChatSharedLocation | null {
  try {
    const url = new URL(urlText);
    const destination = url.searchParams.get("destination");
    if (destination) {
      const parsed = parseCoordsFromParam(destination);
      if (parsed) return parsed;
    }
    const q = url.searchParams.get("q");
    if (q) {
      const parsed = parseCoordsFromParam(q);
      if (parsed) return parsed;
    }
  } catch {
    // fall through to regex parsing
  }
  return null;
}

export function parseChatSharedLocation(body: string): ChatSharedLocation | null {
  const text = body.trim();
  if (!text) return null;

  const urlMatch = text.match(/https?:\/\/[^\s]+/i);
  if (urlMatch) {
    const parsed = parseCoordsFromMapsUrl(urlMatch[0]);
    if (parsed) return { ...parsed, ...extractChatLocationCopy(text) };
  }

  const destinationMatch = text.match(
    /[?&]destination=([^&\s]+)/i
  );
  if (destinationMatch) {
    const parsed = parseCoordsFromParam(destinationMatch[1]);
    if (parsed) return { ...parsed, ...extractChatLocationCopy(text) };
  }

  const qMatch = text.match(/[?&]q=([^&\s]+)/i);
  if (qMatch) {
    const parsed = parseCoordsFromParam(qMatch[1]);
    if (parsed) return { ...parsed, ...extractChatLocationCopy(text) };
  }

  const geoMatch = text.match(/(-?\d+(?:\.\d+)?)\s*[,|%2C]\s*(-?\d+(?:\.\d+)?)/i);
  if (
    geoMatch &&
    (text.includes("maps.google") ||
      text.includes("google.com/maps") ||
      text.toLowerCase().includes("location"))
  ) {
    const parsed = parseCoordPair(geoMatch[1], geoMatch[2]);
    if (parsed) return { ...parsed, ...extractChatLocationCopy(text) };
  }

  return null;
}

function extractChatLocationCopy(body: string): Pick<ChatSharedLocation, "label" | "leadText"> {
  const lines = body
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  let label: string | undefined;
  let leadText: string | undefined;

  for (const line of lines) {
    if (/^https?:\/\//i.test(line) || line.includes("google.com/maps")) continue;

    if (line.startsWith("📍")) {
      label = line.replace(/^📍\s*/, "").trim() || undefined;
      continue;
    }

    if (!leadText) {
      leadText = line.replace(/:\s*[^:\n]+$/, "").trim() || line;
    }
  }

  if (!label) {
    const inline = lines.find((line) => /location/i.test(line) && line.includes(":"));
    if (inline) {
      const parts = inline.split(":");
      if (parts.length >= 2) {
        leadText = leadText ?? parts[0].trim();
        label = parts.slice(1).join(":").trim() || undefined;
      }
    }
  }

  return { label, leadText };
}
