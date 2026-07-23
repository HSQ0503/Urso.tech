// At-rest encryption for BYO org API keys (brain_org_keys). AES-256-GCM with a
// key derived from BRAIN_KEYS_SECRET — server-only; never import client-side.
// Ciphertext format: "v1:<iv b64>:<tag b64>:<data b64>".

import "server-only";

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

function derivedKey(): Buffer {
  const secret = process.env.BRAIN_KEYS_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error("BRAIN_KEYS_SECRET is not set (any long random string) — required to store or read org API keys.");
  }
  return createHash("sha256").update(secret).digest();
}

export function encryptApiKey(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", derivedKey(), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return `v1:${iv.toString("base64")}:${cipher.getAuthTag().toString("base64")}:${data.toString("base64")}`;
}

export function decryptApiKey(ciphertext: string): string {
  const [v, ivB64, tagB64, dataB64] = ciphertext.split(":");
  if (v !== "v1" || !ivB64 || !tagB64 || !dataB64) throw new Error("Unrecognized org-key ciphertext format.");
  const decipher = createDecipheriv("aes-256-gcm", derivedKey(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(dataB64, "base64")), decipher.final()]).toString("utf8");
}
