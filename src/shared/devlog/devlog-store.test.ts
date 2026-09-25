import { redact, redactUrl } from './devlog-store';

describe('redact', () => {
  it('masks secrets at any depth and leaves other fields alone', () => {
    const result = redact({
      email: 'a@b.com',
      password: 'hunter22',
      nested: { access_token: 'eyJhbGciOiJIUzI1NiJ9.payload.sig', trips: [{ token: 'short' }] },
    });

    expect(result).toEqual({
      email: 'a@b.com',
      password: '••••',
      nested: { access_token: 'eyJhbG…(32)', trips: [{ token: '••••' }] },
    });
  });

  it('does not mutate the original object', () => {
    const body = { password: 'hunter22' };
    redact(body);
    expect(body.password).toBe('hunter22');
  });
});

describe('redactUrl', () => {
  it('hides the websocket token query param', () => {
    expect(redactUrl('ws://localhost:5173/api/v1/ws/driver?token=abc.def.ghi&device_id=tab-1')).toBe(
      'ws://localhost:5173/api/v1/ws/driver?token=••••&device_id=tab-1',
    );
  });
});
