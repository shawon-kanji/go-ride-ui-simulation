import { useQuery } from '@tanstack/react-query';

import { apiRequest } from '../api/http-client';
import type { Role } from '../tab/types';

// go-ride-backend's Google Places proxy (/api/v1/places/*). Both apps call it with
// their own token (AuthRequired, no role check), so the browser key never needs Places.
// Mirrors application/places/dto.go.

export interface PlaceSuggestion {
  place_id: string;
  primary_text: string;
  secondary_text?: string;
}

export interface AutocompleteResponse {
  suggestions: PlaceSuggestion[];
}

export interface ResolvedPlace {
  place_id?: string;
  name?: string;
  formatted_address: string;
  lat: number;
  lng: number;
}

export const placesClient = {
  autocomplete: (role: Role, input: string, near?: { lat: number; lng: number }) =>
    apiRequest<AutocompleteResponse>('/api/v1/places/autocomplete', {
      query: { input, lat: near?.lat, lng: near?.lng },
      auth: role,
    }),
  details: (role: Role, placeId: string) =>
    apiRequest<ResolvedPlace>(`/api/v1/places/${encodeURIComponent(placeId)}`, { auth: role }),
  reverseGeocode: (role: Role, lat: number, lng: number) =>
    apiRequest<ResolvedPlace>('/api/v1/places/reverse-geocode', { query: { lat, lng }, auth: role }),
};

/** Rounded to ~11m so nearby points share one lookup. */
export const placeKeys = {
  reverse: (lat: number, lng: number) => ['places', 'reverse', lat.toFixed(4), lng.toFixed(4)] as const,
  autocomplete: (input: string) => ['places', 'autocomplete', input] as const,
};

export function useReverseGeocode(role: Role, point: { lat: number; lng: number } | null) {
  return useQuery({
    queryKey: point ? placeKeys.reverse(point.lat, point.lng) : ['places', 'reverse', 'none'],
    queryFn: () => placesClient.reverseGeocode(role, point!.lat, point!.lng),
    enabled: point !== null,
    staleTime: Infinity,
    retry: false,
  });
}

/** Street-level label for a coordinate. */
export function usePlaceLabel(role: Role, lat: number, lng: number) {
  return useQuery({
    queryKey: placeKeys.reverse(lat, lng),
    queryFn: () => placesClient.reverseGeocode(role, lat, lng),
    staleTime: Infinity,
    retry: false,
    select: (place) => shortAddress(place.formatted_address),
  });
}

/** "17, Jalan Negeri Sembilan Selatan, Bukit Persekutuan, 50480 …" → "17, Jalan Negeri Sembilan Selatan". */
export function shortAddress(formatted: string): string {
  const parts = formatted.split(',').map((part) => part.trim()).filter(Boolean);
  if (parts.length === 0) return formatted;
  // A bare street number reads badly on its own; keep it with the street.
  return /^\d+[A-Za-z]?$/.test(parts[0]) && parts[1] ? `${parts[0]}, ${parts[1]}` : parts[0];
}

/** What follows shortAddress(), e.g. "Bukit Persekutuan, 50480 Kuala Lumpur". */
export function addressRemainder(formatted: string): string {
  const head = shortAddress(formatted);
  return formatted.startsWith(head) ? formatted.slice(head.length).replace(/^\s*,\s*/, '') : formatted;
}
