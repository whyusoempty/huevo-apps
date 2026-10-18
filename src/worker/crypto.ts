const enc = new TextEncoder();

const hex = (buf: ArrayBuffer) =>
  [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

export async function sha256(data: string): Promise<ArrayBuffer> {
  return crypto.subtle.digest('SHA-256', enc.encode(data));
}

async function hmacKey(raw: ArrayBuffer | string) {
  const keyData = typeof raw === 'string' ? enc.encode(raw) : raw;
  return crypto.subtle.importKey('raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
}

/** hex(HMAC_SHA256(SHA256(secret), data)) — формула huEVO для hu_hash и коллбека. */
export async function huevoSign(secret: string, data: string): Promise<string> {
  const key = await hmacKey(await sha256(secret));
  return hex(await crypto.subtle.sign('HMAC', key, enc.encode(data)));
}

export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

const b64url = (buf: ArrayBuffer | string) => {
  const bytes = typeof buf === 'string' ? enc.encode(buf) : new Uint8Array(buf);
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

const unb64url = (s: string) => {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
};

export interface JwtPayload { sub: number; mode: 'live' | 'test'; exp: number }

export async function signJwt(secret: string, payload: JwtPayload): Promise<string> {
  const head = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = b64url(JSON.stringify(payload));
  const key = await hmacKey(secret);
  const sig = b64url(await crypto.subtle.sign('HMAC', key, enc.encode(`${head}.${body}`)));
  return `${head}.${body}.${sig}`;
}

export async function verifyJwt(secret: string, token: string): Promise<JwtPayload | null> {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const key = await hmacKey(secret);
  const expected = b64url(await crypto.subtle.sign('HMAC', key, enc.encode(`${parts[0]}.${parts[1]}`)));
  if (!safeEqual(expected, parts[2])) return null;
  try {
    const payload = JSON.parse(unb64url(parts[1])) as JwtPayload;
    if (!payload.exp || payload.exp < Date.now() / 1000) return null;
    return payload;
  } catch {
    return null;
  }
}
