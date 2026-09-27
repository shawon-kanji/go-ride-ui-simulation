import { useEffect, useRef, useState } from 'react';

import { accountsFor, devClient, testAccountsErrorMessage } from '../../shared/api/dev-client';
import { ApiError } from '../../shared/api/http-client';
import type { TestAccounts } from '../../shared/api/types';
import type { Role } from '../../shared/tab/types';
import { useLoginMutation } from './api';

// /driver/login?as=<email> and /user/login?as=<email>: the tab signs itself in as that test
// account with the shared test password from go-ride-backend. The simulator's quick setup opens
// tabs this way. The password is fetched, never put in the URL.

export type AutoSignInState =
  | { status: 'idle' }
  | { status: 'signing-in'; email: string }
  | { status: 'failed'; email: string; message: string };

/** The password to sign `email` in with, or why it can't be. */
export function testCredentialsFor(accounts: TestAccounts, role: Role, email: string): { password: string } {
  const account = accountsFor(accounts, role).find((a) => a.email === email);
  if (!account) {
    throw new Error(`${email} isn’t a ${role} test account in go-ride-backend/config/test-accounts.yaml.`);
  }
  if (!account.ready) {
    throw new Error(`${email} isn’t seeded yet — run make seed in go-ride-backend.`);
  }
  return { password: accounts.password };
}

export function useAutoSignIn(role: Role, email: string | null): AutoSignInState {
  const { mutateAsync: login } = useLoginMutation(role);
  const [state, setState] = useState<AutoSignInState>(() => (email ? { status: 'signing-in', email } : { status: 'idle' }));
  // StrictMode re-runs effects; a second sign-in for the same tab would be wasted.
  const started = useRef<string | null>(null);

  useEffect(() => {
    if (!email || started.current === email) return;
    started.current = email;
    void (async () => {
      let password: string;
      try {
        password = testCredentialsFor(await devClient.testAccounts(), role, email).password;
      } catch (error) {
        setState({ status: 'failed', email, message: testAccountsErrorMessage(error) });
        return;
      }
      try {
        // On success the session is set and the login route redirects this tab home.
        await login({ email, password });
      } catch (error) {
        const message =
          error instanceof ApiError && error.status === 401
            ? `The test password was rejected for ${email} — run make seed in go-ride-backend to reset it.`
            : error instanceof Error
              ? error.message
              : 'Unable to sign in.';
        setState({ status: 'failed', email, message });
      }
    })();
  }, [email, role, login]);

  return state;
}
