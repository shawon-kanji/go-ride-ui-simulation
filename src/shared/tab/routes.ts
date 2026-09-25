import type { Role } from './types';

/** URL prefix for each role's app. The rider app lives at /user to match the repo name. */
export const ROLE_BASE: Record<Role, string> = {
  rider: '/user',
  driver: '/driver',
};
