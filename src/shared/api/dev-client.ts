import { ApiError, apiRequest } from './http-client';
import type { Role } from '../tab/types';
import type { TestAccount, TestAccounts } from './types';

// Local test accounts, defined in go-ride-backend's config/test-accounts.yaml and seeded with
// `make seed`. The route only exists when that backend runs with DEV_TOOLS_ENABLED=true.

export const devClient = {
  testAccounts: () => apiRequest<TestAccounts>('/api/v1/dev/test-accounts'),
};

export const accountsFor = (accounts: TestAccounts, role: Role): TestAccount[] =>
  role === 'rider' ? accounts.riders : accounts.drivers;

/** Why the test accounts couldn't be read, as something to act on. */
export function testAccountsErrorMessage(error: unknown): string {
  if (error instanceof ApiError && error.status === 404) {
    return 'Test accounts are off: set DEV_TOOLS_ENABLED=true in go-ride-backend/.env and restart go-ride-backend.';
  }
  if (error instanceof ApiError && error.status >= 500 && error.code !== 'TEST_ACCOUNTS_INVALID') {
    return 'go-ride-backend isn’t answering — is the Go stack running?';
  }
  return error instanceof Error ? error.message : String(error);
}
