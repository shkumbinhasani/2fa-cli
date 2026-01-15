// TOTP implementation using Web Crypto API

function base32Decode(encoded: string): Uint8Array {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const cleanedInput = encoded.toUpperCase().replace(/=+$/, "").replace(/\s/g, "");

  const output: number[] = [];
  let bits = 0;
  let value = 0;

  for (const char of cleanedInput) {
    const idx = alphabet.indexOf(char);
    if (idx === -1) continue;

    value = (value << 5) | idx;
    bits += 5;

    if (bits >= 8) {
      output.push((value >> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }

  return new Uint8Array(output);
}

async function hmacSha1(key: Uint8Array, message: Uint8Array): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    key,
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign("HMAC", cryptoKey, message);
  return new Uint8Array(signature);
}

export async function generateTOTP(secret: string, digits = 6, period = 30): Promise<string> {
  const key = base32Decode(secret);
  const time = Math.floor(Date.now() / 1000 / period);

  // Convert time to 8-byte buffer (big-endian)
  const timeBuffer = new Uint8Array(8);
  let t = time;
  for (let i = 7; i >= 0; i--) {
    timeBuffer[i] = t & 0xff;
    t = Math.floor(t / 256);
  }

  const hmac = await hmacSha1(key, timeBuffer);

  // Dynamic truncation
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code = (
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff)
  ) % Math.pow(10, digits);

  return code.toString().padStart(digits, "0");
}

export function getTimeRemaining(period = 30): number {
  return period - (Math.floor(Date.now() / 1000) % period);
}

export function parseOtpAuthUrl(url: string): { issuer: string; account: string; secret: string; digits: number; period: number } | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "otpauth:") return null;
    if (parsed.host !== "totp") return null;

    const path = decodeURIComponent(parsed.pathname.slice(1));
    const secret = parsed.searchParams.get("secret");
    if (!secret) return null;

    let issuer = parsed.searchParams.get("issuer") || "";
    let account = path;

    // Handle "issuer:account" format in path
    if (path.includes(":")) {
      const parts = path.split(":");
      if (!issuer) issuer = parts[0];
      account = parts.slice(1).join(":");
    }

    const digits = parseInt(parsed.searchParams.get("digits") || "6", 10);
    const period = parseInt(parsed.searchParams.get("period") || "30", 10);

    return { issuer, account, secret, digits, period };
  } catch {
    return null;
  }
}
