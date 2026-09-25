import { useMutation } from '@tanstack/react-query';

import { driverAuthClient, riderAuthClient } from '../../shared/api/auth-client';
import type { LoginPayload, SignupPayload } from '../../shared/api/types';
import { logEvent } from '../../shared/devlog/devlog-store';
import { sessionStores, type SessionUser } from '../../shared/session/session-store';
import type { Role } from '../../shared/tab/types';

interface LoginOutcome {
  token: string;
  user: SessionUser;
}

async function login(role: Role, payload: LoginPayload): Promise<LoginOutcome> {
  if (role === 'rider') {
    const result = await riderAuthClient.login(payload);
    return { token: result.access_token, user: result.user };
  }
  const result = await driverAuthClient.login(payload);
  return { token: result.access_token, user: result.driver };
}

function storeSession(role: Role, outcome: LoginOutcome): void {
  sessionStores[role].getState().setSession(outcome.token, outcome.user);
  logEvent('state', `signed in as ${outcome.user.email}`, { userId: outcome.user.id });
}

export function useLoginMutation(role: Role) {
  return useMutation({
    mutationFn: (payload: LoginPayload) => login(role, payload),
    onSuccess: (outcome) => storeSession(role, outcome),
  });
}

/** Signup succeeded but the chained login failed — the account exists, so route to login. */
export class SignupSucceededLoginFailedError extends Error {
  email: string;
  constructor(email: string) {
    super('Account created — please log in.');
    this.email = email;
  }
}

export function useSignupMutation(role: Role) {
  return useMutation({
    mutationFn: async (payload: SignupPayload) => {
      // Signup returns no token, so chain a login with the same credentials.
      if (role === 'rider') await riderAuthClient.signup(payload);
      else await driverAuthClient.signup(payload);
      try {
        return await login(role, { email: payload.email, password: payload.password });
      } catch {
        throw new SignupSucceededLoginFailedError(payload.email);
      }
    },
    onSuccess: (outcome) => storeSession(role, outcome),
  });
}

export function logout(role: Role): void {
  sessionStores[role].getState().clearSession();
  logEvent('state', 'signed out');
}
