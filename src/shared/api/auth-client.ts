import { apiRequest } from './http-client';
import type {
  Driver,
  DriverLoginResult,
  LoginPayload,
  Rider,
  RiderLoginResult,
  SignupPayload,
} from './types';

// Signup returns 201 with the account but no token — callers chain into login().

export const riderAuthClient = {
  signup: (payload: SignupPayload) =>
    apiRequest<{ user: Rider }>('/api/v1/auth/signup', { method: 'POST', body: payload }),
  login: (payload: LoginPayload) =>
    apiRequest<RiderLoginResult>('/api/v1/auth/login', { method: 'POST', body: payload }),
};

export const driverAuthClient = {
  signup: (payload: SignupPayload) =>
    apiRequest<{ driver: Driver }>('/api/v1/driver/auth/signup', { method: 'POST', body: payload }),
  login: (payload: LoginPayload) =>
    apiRequest<DriverLoginResult>('/api/v1/driver/auth/login', { method: 'POST', body: payload }),
};
