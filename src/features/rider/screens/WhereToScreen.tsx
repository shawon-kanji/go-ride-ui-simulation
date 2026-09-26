import { ArrowRight, CalendarDays, Clock, Heart, LoaderCircle, Map as MapIcon, MapPin, Plane, TriangleAlert, X } from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router';

import { distanceKm, formatPlaceDistance } from '../../../shared/lib/format';
import { useLocationStore, type GeoPoint } from '../../../shared/location/location-store';
import { KL_CENTER } from '../../../shared/map/constants';
import { addressRemainder, placeKeys, placesClient, shortAddress, usePlaceLabel, useReverseGeocode } from '../../../shared/places/places';
import { useRiderSession } from '../../../shared/session/session-store';
import { useRecentTripsQuery } from '../api/queries';
import type { TripHistoryEntry } from '../api/types';
import { useBookingDraft, type DraftPlace } from '../booking/booking-draft';
import { AccountSheet } from '../components/AccountSheet';
import { isActivePhase } from '../trip/trip-model';
import { dispatchTrip, useTripStore } from '../trip/trip-store';

// R01 Where to. Lilac header with the search field and the airport promo, then a sheet
// with Recent (drop-offs from GET /cab/trips) / Suggested / Saved. Typing searches the
// backend's Places proxy. The handoff's back arrow becomes the account button here —
// R01 is the rider's home, and R07 (profile) comes later.

type Tab = 'recent' | 'suggested' | 'saved';

// Well-known Klang Valley places, so a test booking is one tap away.
const SUGGESTED: DraftPlace[] = [
  { label: 'KLIA Terminal 1 · Departures', detail: 'Jalan KLIA, Sepang, Selangor', lat: 2.7456, lng: 101.7072 },
  { label: 'Suria KLCC', detail: 'Jalan Ampang, Kuala Lumpur City Centre', lat: 3.1579, lng: 101.7116 },
  { label: 'KL Sentral', detail: 'Jalan Stesen Sentral, Brickfields', lat: 3.134, lng: 101.6865 },
  { label: 'Pavilion Kuala Lumpur', detail: 'Jalan Bukit Bintang', lat: 3.1488, lng: 101.7133 },
  { label: 'Sungei Wang Plaza · Main Entrance', detail: 'Jalan Sultan Ismail, Bukit Bintang', lat: 3.1456, lng: 101.711 },
  { label: 'Mid Valley Megamall', detail: 'Lingkaran Syed Putra, Mid Valley City', lat: 3.1177, lng: 101.6776 },
];

function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return debounced;
}

interface PlaceRowProps {
  icon: ReactNode;
  title: string;
  subtitle?: string;
  busy?: boolean;
  onPress: () => void;
  testId?: string;
}

function PlaceRow({ icon, title, subtitle, busy, onPress, testId }: PlaceRowProps) {
  return (
    <button
      type="button"
      onClick={onPress}
      data-testid={testId}
      className="flex w-full items-start gap-3 border-b border-r-line px-2 py-[14px] text-left last:border-b-0 hover:bg-white/60"
    >
      <span className="mt-0.5 shrink-0 text-r-ink-2">{busy ? <LoaderCircle size={20} className="animate-spin" /> : icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-[16px] font-bold text-r-ink">{title}</span>
        {subtitle && <span className="mt-0.5 block text-[14px] leading-snug text-r-ink-2">{subtitle}</span>}
      </span>
    </button>
  );
}

function withDistance(from: GeoPoint | null, to: GeoPoint, text?: string): string {
  const parts = [from ? formatPlaceDistance(distanceKm(from, to)) : null, text].filter(Boolean);
  return parts.join(' · ');
}

function RecentRow({ trip, from, onPick }: { trip: TripHistoryEntry; from: GeoPoint | null; onPick: (p: DraftPlace) => void }) {
  const point = { lat: trip.dropoff_lat, lng: trip.dropoff_lng };
  const { data: place } = useReverseGeocode('rider', point);
  const label = place ? (place.name ?? shortAddress(place.formatted_address)) : 'Loading…';
  const detail = place ? addressRemainder(place.formatted_address) : undefined;
  return (
    <PlaceRow
      icon={<Clock size={20} />}
      title={label}
      subtitle={withDistance(from, point, detail)}
      onPress={() => onPick({ ...point, label: place ? label : undefined, detail })}
    />
  );
}

/** Distinct recent drop-offs (≈11 m apart), newest first. */
function recentDropoffs(trips: TripHistoryEntry[] | undefined): TripHistoryEntry[] {
  const seen = new Set<string>();
  const out: TripHistoryEntry[] = [];
  for (const trip of trips ?? []) {
    const key = `${trip.dropoff_lat.toFixed(4)},${trip.dropoff_lng.toFixed(4)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trip);
    if (out.length === 5) break;
  }
  return out;
}

export function WhereToScreen() {
  const navigate = useNavigate();
  const user = useRiderSession((s) => s.user);
  const position = useLocationStore((s) => s.position);
  const setDropoff = useBookingDraft((s) => s.setDropoff);
  const trip = useTripStore((s) => s.trip);
  const [tab, setTab] = useState<Tab>('suggested');
  const [query, setQuery] = useState('');
  const [accountOpen, setAccountOpen] = useState(false);
  const [resolving, setResolving] = useState<string | null>(null);
  const [resolveError, setResolveError] = useState<string | null>(null);
  const search = useDebounced(query.trim(), 300);
  const near = position ?? KL_CENTER;

  // A finished trip has had its screen; home starts clean.
  useEffect(() => {
    if (trip && !isActivePhase(trip.phase)) dispatchTrip({ type: 'clear' });
  }, [trip]);

  const recent = useRecentTripsQuery();
  const recentPlaces = useMemo(() => recentDropoffs(recent.data?.trips), [recent.data]);
  const suggestions = useQuery({
    queryKey: placeKeys.autocomplete(search),
    queryFn: () => placesClient.autocomplete('rider', search, near),
    enabled: search.length >= 2,
    staleTime: 60_000,
    retry: false,
  });
  const { data: hereLabel } = usePlaceLabel('rider', near.lat, near.lng);

  const pick = (place: DraftPlace) => {
    setDropoff(place);
    navigate('/user/pickup');
  };

  const pickSuggestion = async (placeId: string) => {
    setResolving(placeId);
    setResolveError(null);
    try {
      const place = await placesClient.details('rider', placeId);
      pick({
        lat: place.lat,
        lng: place.lng,
        label: place.name ?? shortAddress(place.formatted_address),
        detail: addressRemainder(place.formatted_address),
      });
    } catch (error) {
      setResolveError(error instanceof Error ? error.message : 'Could not load that place.');
    } finally {
      setResolving(null);
    }
  };

  const initials = user ? `${user.first_name.charAt(0)}${user.last_name.charAt(0)}`.toUpperCase() : '';
  const searching = query.trim().length > 0;

  return (
    <div className="relative flex flex-1 flex-col overflow-hidden bg-r-lilac">
      <div className="px-4 pt-4 pb-5">
        <div className="flex items-center justify-between">
          <button
            type="button"
            aria-label="Account"
            onClick={() => setAccountOpen(true)}
            className="flex h-11 w-11 items-center justify-center rounded-pill bg-white text-[14px] font-extrabold text-r-lilac-ink shadow-float"
          >
            {initials}
          </button>
          <button
            type="button"
            onClick={() => navigate('/user/pickup?for=dropoff')}
            className="flex h-11 items-center gap-2 rounded-pill bg-white px-4 text-[15px] font-bold text-r-lilac-ink shadow-float"
          >
            <MapIcon size={18} /> Map
          </button>
        </div>

        <div className="mt-4 flex items-center gap-2 rounded-[18px] bg-white py-2 pr-2 pl-4 shadow-float">
          <MapPin size={20} className="shrink-0 text-r-pin" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Where to?"
            aria-label="Where to?"
            className="min-w-0 flex-1 bg-transparent py-2 text-[17px] font-semibold text-r-ink outline-none placeholder:text-r-ink-3 [&::-webkit-search-cancel-button]:hidden"
          />
          {query && (
            <button type="button" aria-label="Clear" onClick={() => setQuery('')} className="p-1 text-r-ink-3">
              <X size={18} />
            </button>
          )}
          <button
            type="button"
            disabled
            title="Scheduled rides aren’t supported yet"
            className="flex shrink-0 items-center gap-1.5 rounded-[12px] bg-primary-50 px-3 py-2 text-[15px] font-bold text-primary-700 opacity-80"
          >
            <CalendarDays size={16} /> Later
          </button>
        </div>

        {!searching && (
          <div className="mt-4 flex items-center gap-3">
            <div className="flex-1">
              <p className="text-[19px] font-extrabold text-r-lilac-ink">Airport pickup, sorted</p>
              <p className="mt-0.5 text-[14px] leading-snug text-r-lilac-ink/75">
                Add your flight number and we watch the delay for you.
              </p>
            </div>
            <button
              type="button"
              aria-label="Book to KLIA"
              onClick={() => pick(SUGGESTED[0])}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-pill bg-white text-r-lilac-ink shadow-float"
            >
              <ArrowRight size={20} />
            </button>
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col overflow-hidden rounded-t-sheet bg-r-bg">
        {!position && (
          <div className="mx-4 mt-4 flex items-start gap-2 rounded-card bg-warning-50 px-3 py-2.5 text-[13px] font-semibold text-warning-700">
            <TriangleAlert size={16} className="mt-px shrink-0" />
            This tab has no location yet. Place it in the simulator — until then pickup starts in central KL.
          </div>
        )}

        {searching ? (
          <div className="flex-1 overflow-y-auto px-4 pt-3 pb-24">
            <p className="px-2 pb-1 text-[12px] font-bold uppercase tracking-[0.1em] text-r-ink-3">
              Results near {hereLabel ?? 'you'}
            </p>
            {resolveError && <p className="px-2 py-2 text-[13px] font-semibold text-danger-600">{resolveError}</p>}
            {suggestions.isFetching && !suggestions.data && (
              <p className="px-2 py-4 text-[14px] text-r-ink-3">Searching…</p>
            )}
            {suggestions.isError && (
              <p className="px-2 py-4 text-[14px] text-danger-600">{suggestions.error.message}</p>
            )}
            {suggestions.data?.suggestions.length === 0 && (
              <p className="px-2 py-4 text-[14px] text-r-ink-3">No places match “{search}”.</p>
            )}
            {suggestions.data?.suggestions.map((s) => (
              <PlaceRow
                key={s.place_id}
                icon={<MapPin size={20} />}
                title={s.primary_text}
                subtitle={s.secondary_text}
                busy={resolving === s.place_id}
                testId="place-suggestion"
                onPress={() => void pickSuggestion(s.place_id)}
              />
            ))}
          </div>
        ) : (
          <>
            <div className="flex gap-2 px-4 pt-5 pb-2" role="tablist">
              {(['recent', 'suggested', 'saved'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  role="tab"
                  aria-selected={tab === t}
                  onClick={() => setTab(t)}
                  className={`rounded-pill px-4 py-2 text-[15px] font-bold capitalize ${tab === t ? 'bg-primary-50 text-primary-700' : 'text-r-ink-3'}`}
                >
                  {t}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto px-4 pb-24">
              {tab === 'recent' &&
                (recentPlaces.length > 0 ? (
                  recentPlaces.map((t) => <RecentRow key={t.request_id} trip={t} from={position} onPick={pick} />)
                ) : (
                  <p className="px-2 py-6 text-[14px] text-r-ink-3">
                    {recent.isLoading ? 'Loading your trips…' : 'Your past drop-offs will show up here.'}
                  </p>
                ))}

              {tab === 'suggested' &&
                SUGGESTED.map((place, i) => (
                  <PlaceRow
                    key={place.label}
                    icon={i === 0 ? <Plane size={20} /> : <MapPin size={20} />}
                    title={place.label!}
                    subtitle={withDistance(position, place, place.detail)}
                    testId="suggested-place"
                    onPress={() => pick(place)}
                  />
                ))}

              {tab === 'saved' && (
                <div className="flex flex-col items-center px-6 py-10 text-center">
                  <Heart size={28} className="text-r-ink-3" />
                  <p className="mt-3 text-[15px] font-bold text-r-ink">No saved places yet</p>
                  <p className="mt-1 text-[13px] text-r-ink-3">The backend doesn’t store saved places yet.</p>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-5 flex justify-center">
        <button
          type="button"
          onClick={() => navigate('/user/pickup?for=dropoff')}
          className="pointer-events-auto flex items-center gap-2 rounded-pill bg-white px-6 py-3.5 text-[15px] font-bold text-r-ink shadow-float"
        >
          <MapIcon size={18} /> Choose on map
        </button>
      </div>

      <AccountSheet open={accountOpen} onDismiss={() => setAccountOpen(false)} />
    </div>
  );
}
