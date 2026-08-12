const encoder = new TextEncoder();
const signedValue = "lotly-authorised";

function toHex(bytes: ArrayBuffer) {
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function authSecret() {
  return process.env.LOTLY_AUTH_SECRET || process.env.LOTLY_PASSWORD || "";
}

export function isPasswordProtectionEnabled() {
  return Boolean(process.env.LOTLY_PASSWORD);
}

export async function createAuthToken() {
  const secret = await authSecret();
  if (!secret) return "";
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(signedValue));
  return `${signedValue}.${toHex(signature)}`;
}

export async function isValidAuthToken(token?: string) {
  if (!isPasswordProtectionEnabled()) return true;
  if (!token) return false;
  return token === await createAuthToken();
}

export function isCorrectPassword(password: string) {
  const expected = process.env.LOTLY_PASSWORD;
  return Boolean(expected && password === expected);
}
