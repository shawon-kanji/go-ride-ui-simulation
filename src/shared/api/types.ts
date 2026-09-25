// Hand-maintained mirrors of the Go DTOs, copied from the Expo apps' src/api/types.ts.
// Keep in sync with go-ride-backend (application/user, application/driver) and
// go-ride-kafka-consumers when those contracts change.

export interface Rider {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  account_status: 'active' | 'deactivated';
}

export interface Driver {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  account_status: 'pending' | 'active' | 'blocked';
  is_email_verified: boolean;
  is_online: boolean;
  is_paused: boolean;
}

export interface SignupPayload {
  email: string;
  password: string;
  first_name: string;
  last_name: string;
}

export interface LoginPayload {
  email: string;
  password: string;
}

export interface RiderLoginResult {
  access_token: string;
  user: Rider;
}

export interface DriverLoginResult {
  access_token: string;
  driver: Driver;
}
