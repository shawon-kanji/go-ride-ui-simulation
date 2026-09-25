function base64Url(value: object): string {
  return btoa(JSON.stringify(value)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}

/** An unsigned JWT-shaped token whose `exp` is `expiresInMs` from now. */
export function makeToken(expiresInMs: number, claims: Record<string, unknown> = {}): string {
  const exp = Math.floor((Date.now() + expiresInMs) / 1000);
  return `${base64Url({ alg: 'HS256', typ: 'JWT' })}.${base64Url({ exp, ...claims })}.signature`;
}

export const riderUser = {
  id: '5b0c3a70-0000-4000-8000-000000000001',
  email: 'rider1@example.com',
  first_name: 'Riya',
  last_name: 'Rider',
};

export const driverUser = {
  id: '5b0c3a70-0000-4000-8000-000000000002',
  email: 'driver1@example.com',
  first_name: 'Dev',
  last_name: 'Driver',
};
