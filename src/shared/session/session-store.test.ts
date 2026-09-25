import { driverUser, makeToken, riderUser } from '../../test/jwt-fixtures';
import { createSessionStore, SESSION_ENDED_MESSAGE, sessionStorageKey } from './session-store';

describe('createSessionStore', () => {
  it('persists a session to sessionStorage under the role key', () => {
    const store = createSessionStore('rider');
    const token = makeToken(60 * 60 * 1000);

    store.getState().setSession(token, { ...riderUser, account_status: 'active' } as typeof riderUser);

    const stored = JSON.parse(window.sessionStorage.getItem(sessionStorageKey('rider'))!);
    expect(stored).toEqual({ token, user: riderUser });
    expect(store.getState().tokenExpiresAt).toBeGreaterThan(Date.now());
  });

  it('hydrates a live session on creation, as after a reload', () => {
    const token = makeToken(30 * 60 * 1000);
    window.sessionStorage.setItem(sessionStorageKey('driver'), JSON.stringify({ token, user: driverUser }));

    const store = createSessionStore('driver');

    expect(store.getState().token).toBe(token);
    expect(store.getState().user).toEqual(driverUser);
  });

  it('keeps rider and driver sessions independent in the same tab', () => {
    const rider = createSessionStore('rider');
    const driver = createSessionStore('driver');

    rider.getState().setSession(makeToken(60_000), riderUser);
    driver.getState().setSession(makeToken(60_000), driverUser);
    rider.getState().clearSession();

    expect(createSessionStore('rider').getState().token).toBeNull();
    expect(createSessionStore('driver').getState().user).toEqual(driverUser);
  });

  it('drops an expired stored session and explains why', () => {
    const token = makeToken(-1_000);
    window.sessionStorage.setItem(sessionStorageKey('rider'), JSON.stringify({ token, user: riderUser }));

    const store = createSessionStore('rider');

    expect(store.getState().token).toBeNull();
    expect(window.sessionStorage.getItem(sessionStorageKey('rider'))).toBeNull();
    expect(store.getState().consumeSessionExpiredReason()).toBe(SESSION_ENDED_MESSAGE);
    expect(store.getState().consumeSessionExpiredReason()).toBeNull();
  });

  it('clearSession removes storage and records the reason', () => {
    const store = createSessionStore('driver');
    store.getState().setSession(makeToken(60_000), driverUser);

    store.getState().clearSession('bye');

    expect(window.sessionStorage.getItem(sessionStorageKey('driver'))).toBeNull();
    expect(store.getState().sessionExpiredReason).toBe('bye');
  });
});
