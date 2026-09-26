import { AdvancedMarker, useMap, useMapsLibrary } from '@vis.gl/react-google-maps';
import { LoaderCircle, MapPin, Search, X } from 'lucide-react';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';

import type { GeoPoint } from '../../shared/location/location-store';

// Place search for the simulator map: Google Places (New) autocomplete straight from
// the browser (the simulator has no login, so it can't use the backend's places proxy —
// the browser key allows places.googleapis.com for this). Results are biased to the
// visible map. Picking one flies the map there and drops a pin; if a tab is selected,
// the pin offers to move that tab there.

const DEBOUNCE_MS = 250;
const RESULT_ZOOM = 17;

interface Suggestion {
  id: string;
  main: string;
  secondary: string;
  prediction: google.maps.places.PlacePrediction;
}

export interface FoundPlace {
  name: string;
  address: string;
  location: GeoPoint;
}

/** The search box, overlaid on the map (outside <Map>; useMap() finds it via the APIProvider). */
export function PlaceSearch({ onFound }: { onFound: (place: FoundPlace | null) => void }) {
  const map = useMap();
  const places = useMapsLibrary('places');
  const [query, setQuery] = useState('');
  const [results, setSuggestions] = useState<Suggestion[]>([]);
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const session = useRef<google.maps.places.AutocompleteSessionToken | null>(null);
  const latestRequest = useRef(0);

  // Debounced autocomplete, biased to what's on screen.
  useEffect(() => {
    const input = query.trim();
    const requestId = ++latestRequest.current; // also invalidates anything in flight
    if (!places || input.length < 2) return;
    const timer = setTimeout(async () => {
      session.current ??= new places.AutocompleteSessionToken();
      setLoading(true);
      try {
        const { suggestions: results } = await places.AutocompleteSuggestion.fetchAutocompleteSuggestions({
          input,
          sessionToken: session.current,
          locationBias: map?.getBounds() ?? undefined,
        });
        if (requestId !== latestRequest.current) return;
        setSuggestions(
          results.flatMap((s) =>
            s.placePrediction
              ? [
                  {
                    id: s.placePrediction.placeId,
                    main: s.placePrediction.mainText?.text ?? s.placePrediction.text.text,
                    secondary: s.placePrediction.secondaryText?.text ?? '',
                    prediction: s.placePrediction,
                  },
                ]
              : [],
          ),
        );
        setActive(0);
        setError(null);
      } catch (e) {
        if (requestId !== latestRequest.current) return;
        setSuggestions([]);
        setError(e instanceof Error ? e.message : 'Search failed');
      } finally {
        setLoading(false);
      }
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query, places, map]);

  // Short queries show nothing (stale results are just hidden, not cleared).
  const suggestions = query.trim().length >= 2 ? results : [];

  const choose = async (suggestion: Suggestion) => {
    setOpen(false);
    setLoading(true);
    try {
      const place = suggestion.prediction.toPlace();
      await place.fetchFields({ fields: ['displayName', 'formattedAddress', 'location'] });
      session.current = null; // fetchFields ends the billing session
      if (!place.location) throw new Error('That place has no location');
      const location = { lat: place.location.lat(), lng: place.location.lng() };
      onFound({ name: place.displayName ?? suggestion.main, address: place.formattedAddress ?? suggestion.secondary, location });
      setQuery(place.displayName ?? suggestion.main);
      map?.panTo(location);
      map?.setZoom(RESULT_ZOOM);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load that place');
    } finally {
      setLoading(false);
    }
  };

  const clear = () => {
    setQuery('');
    setSuggestions([]);
    onFound(null);
    setError(null);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setActive((i) => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && suggestions[active]) {
      e.preventDefault();
      void choose(suggestions[active]);
    } else if (e.key === 'Escape') {
      // Keep Escape here: the page uses it to deselect the tab.
      e.stopPropagation();
      if (open && suggestions.length > 0) setOpen(false);
      else clear();
    }
  };

  const showList = open && query.trim().length >= 2 && (suggestions.length > 0 || !loading);

  return (
    <>
      <div className="absolute top-4 left-4 z-10 w-[360px] max-w-[calc(100%-2rem)]">
        <div className="flex items-center gap-2 rounded-control bg-white px-3 shadow-lg ring-1 ring-neutral-200 focus-within:ring-2 focus-within:ring-neutral-900">
          {loading ? (
            <LoaderCircle size={18} className="shrink-0 animate-spin text-neutral-400" />
          ) : (
            <Search size={18} className="shrink-0 text-neutral-400" />
          )}
          <input
            type="text"
            role="combobox"
            aria-label="Search places"
            aria-expanded={showList}
            aria-controls="place-search-results"
            value={query}
            placeholder="Search places — KLCC, Bangsar, KLIA…"
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 150)}
            onKeyDown={onKeyDown}
            className="min-w-0 flex-1 bg-transparent py-2.5 text-[14px] font-medium text-neutral-900 outline-none placeholder:text-neutral-400"
          />
          {query && (
            <button type="button" aria-label="Clear search" onClick={clear} className="p-1 text-neutral-400 hover:text-neutral-700">
              <X size={16} />
            </button>
          )}
        </div>

        {showList && (
          <ul
            id="place-search-results"
            role="listbox"
            className="mt-1.5 max-h-[340px] overflow-y-auto rounded-control bg-white py-1 shadow-lg ring-1 ring-neutral-200"
          >
            {suggestions.length === 0 && (
              <li className="px-3 py-2.5 text-[13px] text-neutral-500">{error ?? `No places match “${query.trim()}”`}</li>
            )}
            {suggestions.map((s, i) => (
              <li key={s.id} role="option" aria-selected={i === active}>
                <button
                  type="button"
                  data-testid="place-search-result"
                  onMouseDown={(e) => e.preventDefault()} // keep focus so onBlur doesn't close first
                  onMouseEnter={() => setActive(i)}
                  onClick={() => void choose(s)}
                  className={`flex w-full items-start gap-2.5 px-3 py-2 text-left ${i === active ? 'bg-neutral-100' : ''}`}
                >
                  <MapPin size={16} className="mt-0.5 shrink-0 text-neutral-400" />
                  <span className="min-w-0">
                    <span className="block truncate text-[14px] font-semibold text-neutral-900">{s.main}</span>
                    {s.secondary && <span className="block truncate text-[12px] text-neutral-500">{s.secondary}</span>}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {error && !showList && (
          <p className="mt-1.5 rounded-control bg-white px-3 py-2 text-[12px] font-semibold text-danger-600 shadow-lg">{error}</p>
        )}
      </div>
    </>
  );
}

interface FoundPlaceMarkerProps {
  found: FoundPlace;
  /** Name of the selected tab when it can be moved, else null. */
  movableName: string | null;
  onMoveHere: (point: GeoPoint) => void;
}

/** Pin for the picked search result; offers to move the selected tab there. */
export function FoundPlaceMarker({ found, movableName, onMoveHere }: FoundPlaceMarkerProps) {
  return (
    <AdvancedMarker position={found.location} zIndex={900} anchorLeft="-50%" anchorTop="-100%" title={found.address}>
      {/* Inline styles: Google's unlayered map CSS beats Tailwind's layered utilities. */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', fontFamily: 'var(--font-sans)' }}>
        <div
          style={{
            background: '#111827',
            color: '#fff',
            borderRadius: 10,
            padding: '6px 10px',
            fontSize: 12,
            fontWeight: 700,
            boxShadow: '0 4px 14px rgba(16,22,20,0.3)',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            whiteSpace: 'nowrap',
          }}
        >
          <span style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis' }}>{found.name}</span>
          {movableName && (
            <button
              type="button"
              data-testid="move-here"
              onClick={(e) => {
                e.stopPropagation();
                onMoveHere(found.location);
              }}
              style={{
                background: '#fbbf24',
                color: '#111827',
                border: 0,
                borderRadius: 999,
                padding: '3px 9px',
                fontSize: 12,
                fontWeight: 800,
                cursor: 'pointer',
              }}
            >
              Move {movableName} here
            </button>
          )}
        </div>
        <MapPin size={30} fill="#f4523b" color="#fff" strokeWidth={1.6} style={{ marginTop: 2 }} />
      </div>
    </AdvancedMarker>
  );
}
