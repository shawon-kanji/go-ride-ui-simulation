import { apiRequest } from '../../../shared/api/http-client';
import type { Driver } from '../../../shared/api/types';
import type {
  AcceptOfferResponse,
  CurrentTripResponse,
  DriverStatsResponse,
  EarningsResponse,
  KycStatusResponse,
  OnlineTimeResponse,
  ReverseGeocodeResponse,
  UpdateLocationPayload,
  UpdateLocationResponse,
  Vehicle,
} from './types';

// Every call sends the driver session's token. Paths are proxied by Vite:
// /api/v1/driver/* and /api/v1/places/* → go-ride-backend,
// /api/v1/driver-trips/* → driver-request-handler, /api/v1/location/* → location-producers.

const auth = 'driver' as const;

export type StatsPeriod = 'today' | 'week';

export const driverClient = {
  getProfile: () => apiRequest<{ driver: Driver }>('/api/v1/driver/profile', { auth }),
  setOnline: (isOnline: boolean) =>
    apiRequest<{ driver: Driver }>('/api/v1/driver/online', { method: 'PATCH', body: { is_online: isOnline }, auth }),
  setPaused: (isPaused: boolean) =>
    apiRequest<{ driver: Driver }>('/api/v1/driver/pause', { method: 'PATCH', body: { is_paused: isPaused }, auth }),
};

export const vehiclesClient = {
  list: () => apiRequest<{ vehicles: Vehicle[] }>('/api/v1/driver/vehicles', { auth }),
};

export const kycClient = {
  getStatus: () => apiRequest<KycStatusResponse>('/api/v1/driver/kyc/status', { auth }),
};

export const driverTripsClient = {
  getEarnings: (period: StatsPeriod = 'today') =>
    apiRequest<EarningsResponse>('/api/v1/driver-trips/earnings', { query: { period }, auth }),
  getOnlineTime: (period: StatsPeriod = 'today') =>
    apiRequest<OnlineTimeResponse>('/api/v1/driver-trips/online-time', { query: { period }, auth }),
  getStats: () => apiRequest<DriverStatsResponse>('/api/v1/driver-trips/stats', { auth }),
  getCurrentTrip: () => apiRequest<CurrentTripResponse>('/api/v1/driver-trips/current-trip', { auth }),
  acceptOffer: (jobOfferId: string) =>
    apiRequest<AcceptOfferResponse>(`/api/v1/driver-trips/job-offers/${jobOfferId}/accept`, { method: 'POST', auth }),
};

export const locationClient = {
  update: (payload: UpdateLocationPayload) =>
    apiRequest<UpdateLocationResponse>('/api/v1/location/update-location', { method: 'POST', body: payload, auth }),
};

export const placesClient = {
  reverseGeocode: (lat: number, lng: number) =>
    apiRequest<ReverseGeocodeResponse>('/api/v1/places/reverse-geocode', { query: { lat, lng }, auth }),
};
