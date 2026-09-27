import { ApiError } from '../../shared/api/http-client';
import { testAccountsErrorMessage } from '../../shared/api/dev-client';
import type { TestAccounts } from '../../shared/api/types';
import { testCredentialsFor } from './auto-sign-in';

const ACCOUNTS: TestAccounts = {
  password: 'password123',
  riders: [{ email: 'sim.rider1@goride.test', first_name: 'Riya', last_name: 'Sen', ready: true }],
  drivers: [
    { email: 'sim.driver1@goride.test', first_name: 'Dev', last_name: 'Kumar', ready: true },
    { email: 'sim.driver9@goride.test', first_name: 'New', last_name: 'Driver', ready: false },
  ],
};

describe('testCredentialsFor', () => {
  it('gives the shared password for a ready account of that role', () => {
    expect(testCredentialsFor(ACCOUNTS, 'driver', 'sim.driver1@goride.test')).toEqual({ password: 'password123' });
    expect(testCredentialsFor(ACCOUNTS, 'rider', 'sim.rider1@goride.test')).toEqual({ password: 'password123' });
  });

  it('refuses an account of the other role, an unknown one, and one not seeded yet', () => {
    expect(() => testCredentialsFor(ACCOUNTS, 'rider', 'sim.driver1@goride.test')).toThrow('isn’t a rider test account');
    expect(() => testCredentialsFor(ACCOUNTS, 'driver', 'someone@example.com')).toThrow('isn’t a driver test account');
    expect(() => testCredentialsFor(ACCOUNTS, 'driver', 'sim.driver9@goride.test')).toThrow('run make seed');
  });
});

describe('testAccountsErrorMessage', () => {
  it('says how to turn the endpoint on, or that the backend is down', () => {
    expect(testAccountsErrorMessage(new ApiError(404, 'NOT_FOUND', ''))).toContain('DEV_TOOLS_ENABLED=true');
    expect(testAccountsErrorMessage(new ApiError(502, 'HTTP_502', ''))).toContain('isn’t answering');
    expect(testAccountsErrorMessage(new ApiError(500, 'TEST_ACCOUNTS_INVALID', 'drivers[2]: bad plate'))).toBe('drivers[2]: bad plate');
  });
});
