import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { FastifyReply } from "fastify";

const OG_LOGO_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../assets/address-share-og.png"
);

let cachedLogo: Buffer | null = null;

export async function sendAddressShareOgLogo(reply: FastifyReply): Promise<void> {
  if (!cachedLogo) {
    cachedLogo = await readFile(OG_LOGO_PATH);
  }
  reply
    .header("Cache-Control", "public, max-age=86400")
    .type("image/png")
    .send(cachedLogo);
}
