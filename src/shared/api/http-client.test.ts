import { driverUser, makeToken } from '../../test/jwt-fixtures';
import { useDevLogStore } from '../devlog/devlog-store';
import { SESSION_ENDED_MESSAGE, useDriverSession } from '../session/session-store';
import { apiRequest, ApiError } from './http-client';

function mockFetch(status: number, body?: unknown) {
  const fetchMock = vi.fn().mockResolvedValue(
    new Response(body === undefined ? null : JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
  useDriverSession.getState().clearSession();
  useDevLogStore.getState().clear();
});

describe('apiRequest', () => {
  it("sends the role's bearer token and JSON body", async () => {
    const token = makeToken(60_000);
    useDriverSession.getState().setSession(token, driverUser);
    const fetchMock = mockFetch(200, { ok: true });

    await apiRequest('/api/v1/driver/profile', { method: 'PATCH', body: { first_name: 'X' }, auth: 'driver' });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/v1/driver/profile');
    expect(init.headers).toEqual({ 'Content-Type': 'application/json', Authorization: `Bearer ${token}` });
    expect(init.body).toBe('{"first_name":"X"}');
  });

  it('appends defined query params only', async () => {
    const fetchMock = mockFetch(200, {});
    await apiRequest('/api/v1/places/autocomplete', { query: { input: 'mg road', lat: 12.9, session: undefined } });
    expect(fetchMock.mock.calls[0][0]).toBe('/api/v1/places/autocomplete?input=mg+road&lat=12.9');
  });

  it('normalises go-ride-backend {code, message} errors', async () => {
    mockFetch(403, { code: 'KYC_NOT_APPROVED', message: 'KYC not approved' });
    const error = await apiRequest('/api/v1/driver/online', { method: 'PATCH' }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 403, code: 'KYC_NOT_APPROVED', message: 'KYC not approved' });
  });

  it('normalises kafka-consumers {error, message} errors', async () => {
    mockFetch(409, { error: 'offer_already_taken', message: 'taken' });
    const error = await apiRequest('/api/v1/driver-trips/job-offers/1/accept', { method: 'POST' }).catch((e: unknown) => e);
    expect(error).toMatchObject({ status: 409, code: 'offer_already_taken' });
  });

  it('reports a stopped service when the proxy returns an empty 5xx', async () => {
    mockFetch(502);
    const error = await apiRequest('/api/v1/cab/fare-estimate').catch((e: unknown) => e);
    expect(error).toMatchObject({ status: 502, code: 'SERVICE_UNAVAILABLE' });
  });

  it('clears the session on a 401 for an authenticated call', async () => {
    useDriverSession.getState().setSession(makeToken(60_000), driverUser);
    mockFetch(401, { code: 'UNAUTHORIZED', message: 'bad token' });

    await apiRequest('/api/v1/driver/profile', { auth: 'driver' }).catch(() => undefined);

    expect(useDriverSession.getState().token).toBeNull();
    expect(useDriverSession.getState().sessionExpiredReason).toBe(SESSION_ENDED_MESSAGE);
  });

  it('logs the call with the password redacted', async () => {
    mockFetch(200, { access_token: makeToken(60_000) });
    await apiRequest('/api/v1/auth/login', { method: 'POST', body: { email: 'a@b.com', password: 'hunter22' } });

    const [entry] = useDevLogStore.getState().entries;
    expect(entry.kind).toBe('http');
    expect(entry.summary).toMatch(/^POST \/api\/v1\/auth\/login 200 \d+ms$/);
    expect(entry.data).toMatchObject({ request: { email: 'a@b.com', password: '••••' } });
  });
});
