import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { driverClient, driverTripsClient, kycClient, vehiclesClient } from './clients';

// Query keys are prefixed with 'driver' so a tab that also holds a rider session
// never shares cache entries with it.
export const driverKeys = {
  all: ['driver'] as const,
  profile: () => [...driverKeys.all, 'profile'] as const,
  vehicles: () => [...driverKeys.all, 'vehicles'] as const,
  kyc: () => [...driverKeys.all, 'kyc'] as const,
  earnings: (period: string) => [...driverKeys.all, 'earnings', period] as const,
  onlineTime: (period: string) => [...driverKeys.all, 'online-time', period] as const,
  currentTrip: () => [...driverKeys.all, 'current-trip'] as const,
};

export function useDriverProfileQuery() {
  return useQuery({ queryKey: driverKeys.profile(), queryFn: driverClient.getProfile });
}

export function useVehiclesQuery() {
  return useQuery({ queryKey: driverKeys.vehicles(), queryFn: vehiclesClient.list });
}

export function useKycStatusQuery() {
  return useQuery({ queryKey: driverKeys.kyc(), queryFn: kycClient.getStatus });
}

/** 60s staleTime, as in the app: these change only when a trip completes. */
export function useTodayEarningsQuery() {
  return useQuery({
    queryKey: driverKeys.earnings('today'),
    queryFn: () => driverTripsClient.getEarnings('today'),
    staleTime: 60_000,
  });
}

export function useTodayOnlineTimeQuery() {
  return useQuery({
    queryKey: driverKeys.onlineTime('today'),
    queryFn: () => driverTripsClient.getOnlineTime('today'),
    staleTime: 60_000,
  });
}

export function useCurrentTripQuery() {
  return useQuery({ queryKey: driverKeys.currentTrip(), queryFn: driverTripsClient.getCurrentTrip });
}

/** Deliberately doesn't catch KYC 403s — callers map them with kycBlockReason(). */
export function useSetOnlineMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (isOnline: boolean) => driverClient.setOnline(isOnline),
    onSuccess: (result) => {
      queryClient.setQueryData(driverKeys.profile(), result);
      void queryClient.invalidateQueries({ queryKey: driverKeys.onlineTime('today') });
    },
  });
}

export function useSetPausedMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (isPaused: boolean) => driverClient.setPaused(isPaused),
    onSuccess: (result) => queryClient.setQueryData(driverKeys.profile(), result),
  });
}
