import type { TestAccounts } from '../../../shared/api/types';
import { availability, loginPath, MAX_TABS_PER_CLICK, pickAccounts } from './quick-setup';

const driver = (n: number, ready = true) => ({ email: `sim.driver${n}@goride.test`, first_name: 'D', last_name: `${n}`, ready });
const ACCOUNTS: TestAccounts = {
  password: 'password123',
  riders: [{ email: 'sim.rider1@goride.test', first_name: 'R', last_name: '1', ready: true }],
  drivers: [driver(1), driver(2), driver(3), driver(4, false)],
};

describe('quick setup', () => {
  it('counts ready accounts not signed in anywhere as free', () => {
    const a = availability(ACCOUNTS, 'driver', new Set(['sim.driver2@goride.test']));
    expect(a).toMatchObject({ total: 4, ready: 3 });
    expect(a.free.map((x) => x.email)).toEqual(['sim.driver1@goride.test', 'sim.driver3@goride.test']);
  });

  it('picks the first free accounts', () => {
    const a = availability(ACCOUNTS, 'driver', new Set());
    expect(pickAccounts(a, 'driver', 2)).toEqual({ emails: ['sim.driver1@goride.test', 'sim.driver2@goride.test'] });
  });

  it('refuses more than are free, and says why', () => {
    const a = availability(ACCOUNTS, 'driver', new Set(['sim.driver1@goride.test']));
    const result = pickAccounts(a, 'driver', 5);
    expect(result).toHaveProperty('error');
    const error = (result as { error: string }).error;
    expect(error).toContain('Only 2 free drivers');
    expect(error).toContain('1 already open');
    expect(error).toContain('1 not seeded');
  });

  it('refuses more than the per-click cap and less than one', () => {
    const many: TestAccounts = { ...ACCOUNTS, drivers: Array.from({ length: 20 }, (_, i) => driver(i + 1)) };
    const a = availability(many, 'driver', new Set());
    expect(pickAccounts(a, 'driver', MAX_TABS_PER_CLICK + 1)).toHaveProperty('error');
    expect(pickAccounts(a, 'driver', MAX_TABS_PER_CLICK)).toHaveProperty('emails');
    expect(pickAccounts(a, 'driver', 0)).toHaveProperty('error');
  });

  it('builds each role’s auto sign-in URL', () => {
    expect(loginPath('driver', 'sim.driver1@goride.test')).toBe('/driver/login?as=sim.driver1%40goride.test');
    expect(loginPath('rider', 'sim.rider1@goride.test')).toBe('/user/login?as=sim.rider1%40goride.test');
  });
});
