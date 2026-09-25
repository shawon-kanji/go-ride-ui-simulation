// Client-side JWT reading only — no verification. The mobile apps hand-roll base64
// because Hermes lacks atob; browsers have it, so this is the short version.

interface JwtClaims {
  exp?: number;
  user_id?: string;
  role?: string;
}

function decodeClaims(token: string): JwtClaims | null {
  try {
    const payload = token.split('.')[1];
    if (!payload) return null;
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    const bytes = Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes)) as JwtClaims;
  } catch {
    return null;
  }
}

/** Returns the JWT's `exp` claim as epoch milliseconds, or null if undecodable. */
export function decodeJwtExpiryMs(token: string): number | null {
  const claims = decodeClaims(token);
  return typeof claims?.exp === 'number' ? claims.exp * 1000 : null;
}
