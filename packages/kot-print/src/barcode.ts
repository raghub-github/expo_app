/**
 * Code128-B SVG barcode for thermal print (quiet zone + crisp bars).
 * Encodes the backend pickup token exactly — case-sensitive.
 */

const CODE128_PATTERNS: string[] = [
  "11011001100", "11001101100", "11001100110", "10010011000", "10010001100",
  "10001001100", "10011001000", "10011000100", "10001100100", "11001001000",
  "11001000100", "11000100100", "10110011100", "10011011100", "10011001110",
  "10111001100", "10011101100", "10011100110", "11001110010", "11001011100",
  "11001001110", "11011100100", "11001110100", "11101101110", "11101001100",
  "11100101100", "11100100110", "11101100100", "11100110100", "11100110010",
  "11011011000", "11011000110", "11000110110", "10100011000", "10001011000",
  "10001000110", "10110001000", "10001101000", "10001100010", "11010001000",
  "11000101000", "11000100010", "10110111000", "10110001110", "10001101110",
  "10111011000", "10111000110", "10001110110", "11101110110", "11010001110",
  "11000101110", "11011101000", "11011100010", "11011101110", "11101011000",
  "11101000110", "11100010110", "11101101000", "11101100010", "11100011010",
  "11101111010", "11001000010", "11110001010", "10100110000", "10100001100",
  "10010110000", "10010000110", "10000101100", "10000100110", "10110010000",
  "10110000100", "10011010000", "10011000010", "10000110100", "10000110010",
  "11000010010", "11001010000", "11110111010", "11000010100", "10001111010",
  "10100111100", "10010111100", "10010011110", "10111100100", "10011110100",
  "10011110010", "11110100100", "11110010100", "11110010010", "11011011110",
  "11011110110", "11110110110", "10101111000", "10100011110", "10001011110",
  "10111101000", "10111100010", "11110101000", "11110100010", "10111011110",
  "10111101110", "11101011110", "11110101110", "11010000100", "11010010000",
  "11010011100", "1100011101011",
];

function code128Checksum(values: number[]): number {
  let sum = values[0]!;
  for (let i = 1; i < values.length; i++) {
    sum += values[i]! * i;
  }
  return sum % 103;
}

/** Encode printable ASCII (32–126) as Code128 subset B values. */
function encodeCode128B(text: string): number[] | null {
  const raw = String(text ?? "").trim();
  if (!raw) return null;
  const values: number[] = [104]; // Start B
  for (let i = 0; i < raw.length; i++) {
    const code = raw.charCodeAt(i);
    if (code < 32 || code > 126) return null;
    values.push(code - 32);
  }
  values.push(code128Checksum(values));
  values.push(106); // Stop
  return values;
}

function patternForValues(values: number[]): string {
  return values.map((v) => CODE128_PATTERNS[v] ?? "").join("");
}

function svgDataUri(svg: string): string {
  const encoded =
    typeof btoa === "function"
      ? btoa(svg)
      : Buffer.from(svg, "utf8").toString("base64");
  return `data:image/svg+xml;base64,${encoded}`;
}

/**
 * Scannable Code128 barcode as SVG data URI with quiet zones.
 */
export function pickupTokenToBarcodeDataUri(
  token: string | null | undefined,
  opts?: { barWidth?: number; barHeight?: number; quietModules?: number }
): string {
  const value = String(token ?? "").trim();
  if (!value) return "";

  const values = encodeCode128B(value);
  if (!values) return "";

  const pattern = patternForValues(values);
  if (!pattern) return "";

  const barWidth = Math.max(1, opts?.barWidth ?? 2);
  const barHeight = Math.max(24, opts?.barHeight ?? 48);
  const quietModules = Math.max(4, opts?.quietModules ?? 10);
  const modules = pattern.length;
  const width = (modules + quietModules * 2) * barWidth;
  const height = barHeight + barWidth * 4;

  const parts: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" shape-rendering="crispEdges">`,
    `<rect width="100%" height="100%" fill="#fff"/>`,
  ];

  let x = quietModules * barWidth;
  for (let i = 0; i < modules; i++) {
    if (pattern[i] === "1") {
      parts.push(
        `<rect x="${x}" y="${barWidth * 2}" width="${barWidth}" height="${barHeight}" fill="#000"/>`
      );
    }
    x += barWidth;
  }
  parts.push("</svg>");

  return svgDataUri(parts.join(""));
}
