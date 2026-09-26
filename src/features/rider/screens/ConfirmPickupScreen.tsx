import { useMap } from '@vis.gl/react-google-maps';
import { ArrowLeft, LocateFixed, MapPin, Star } from 'lucide-react';
import { useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router';

import { distanceKm, formatPlaceDistance } from '../../../shared/lib/format';
import { useLocationStore, type GeoPoint } from '../../../shared/location/location-store';
import { KL_CENTER } from '../../../shared/map/constants';
import { addressRemainder, shortAddress, useReverseGeocode } from '../../../shared/places/places';
import { Button } from '../../../shared/ui/Button';
import { useBookingDraft } from '../booking/booking-draft';
import { PIN_COLORS } from '../components/map-colors';
import { PlaceDot, RiderMap } from '../components/map-pieces';

// R02 Confirm pickup: full-bleed map with a fixed centre pin — the rider drags the map,
// the pin stays put, and the spot under it is reverse-geocoded when the map settles.
// With ?for=dropoff the same screen is R01's "Choose on map" for the destination.

function LocateButton({ position, onLocate }: { position: GeoPoint | null; onLocate: () => void }) {
  const map = useMap();
  if (!position) return null;
  return (
    <button
      type="button"
      aria-label="Go to my location"
      onClick={() => {
        map?.panTo(position);
        onLocate();
      }}
      className="flex h-11 w-11 items-center justify-center rounded-pill bg-white text-r-ink shadow-float"
    >
      <LocateFixed size={20} />
    </button>
  );
}

export function ConfirmPickupScreen() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const forDropoff = params.get('for') === 'dropoff';
  const position = useLocationStore((s) => s.position);
  const { pickup, dropoff, setPickup, setDropoff } = useBookingDraft();

  const [initialCenter] = useState<GeoPoint>(() => (forDropoff ? dropoff : pickup) ?? position ?? KL_CENTER);
  const [center, setCenter] = useState<GeoPoint>(initialCenter);
  const [moving, setMoving] = useState(false);
  const place = useReverseGeocode('rider', moving ? null : center);

  if (!forDropoff && !dropoff) return <Navigate to="/user" replace />;

  const title = place.data ? (place.data.name ?? shortAddress(place.data.formatted_address)) : place.isError ? 'Dropped pin' : 'Finding the address…';
  const remainder = place.data ? addressRemainder(place.data.formatted_address) : `${center.lat.toFixed(5)}, ${center.lng.toFixed(5)}`;
  const kmFromYou = position ? distanceKm(position, center) : null;
  const fromYou = kmFromYou === null ? '' : kmFromYou < 0.02 ? 'At your location · ' : `${formatPlaceDistance(kmFromYou)} · `;

  const confirm = () => {
    const chosen = {
      lat: center.lat,
      lng: center.lng,
      label: place.data ? title : undefined,
      detail: place.data ? remainder : undefined,
    };
    if (forDropoff) {
      setDropoff(chosen);
      navigate('/user/pickup', { replace: true });
    } else {
      setPickup(chosen);
      navigate('/user/ride');
    }
  };

  return (
    <div className="relative flex-1 overflow-hidden bg-r-map-land">
      <div className="absolute inset-x-0 top-0 bottom-[250px]">
        <RiderMap
          defaultCenter={initialCenter}
          defaultZoom={17}
          onCameraChanged={() => setMoving(true)}
          onIdle={(e) => {
            const c = e.map.getCenter();
            if (c) setCenter({ lat: c.lat(), lng: c.lng() });
            setMoving(false);
          }}
        >
          {!forDropoff && dropoff && <PlaceDot position={dropoff} kind="dropoff" />}
          {position && <PlaceDot position={position} kind="pickup" />}
        </RiderMap>

        <div className="absolute right-4 bottom-4">
          <LocateButton position={position} onLocate={() => setMoving(true)} />
        </div>

        {/* The fixed centre pin with its callout; the map moves underneath. */}
        <div className="pointer-events-none absolute top-1/2 left-1/2 flex -translate-x-1/2 -translate-y-full flex-col items-center">
          <div className="mb-2 flex items-center gap-2 rounded-pill bg-white py-2 pr-4 pl-2 shadow-float">
            <span className="flex h-7 w-7 items-center justify-center rounded-pill bg-primary-50 text-primary-600">
              <Star size={14} fill="currentColor" />
            </span>
            <span className="text-[15px] font-bold text-r-ink">{forDropoff ? 'Drop-off here' : 'Pickup here'}</span>
          </div>
          <MapPin
            size={34}
            fill={PIN_COLORS.dropoff}
            color="#fff"
            strokeWidth={1.6}
            className={`drop-shadow transition-transform ${moving ? '-translate-y-2' : ''}`}
          />
        </div>
      </div>

      <div className="absolute inset-x-4 top-4 flex items-center gap-3">
        <button
          type="button"
          aria-label="Back"
          onClick={() => navigate('/user')}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-pill bg-white text-r-ink shadow-float"
        >
          <ArrowLeft size={20} />
        </button>
        <div className="flex h-11 min-w-0 flex-1 items-center gap-2 rounded-pill bg-white px-4 shadow-float">
          <span
            className="h-3 w-3 shrink-0 rounded-pill"
            style={{ background: forDropoff ? PIN_COLORS.dropoff : PIN_COLORS.pickup }}
          />
          <span className="truncate text-[15px] font-semibold text-r-ink-2">
            {forDropoff ? 'Drop off at?' : dropoff?.label ? `To ${dropoff.label}` : 'Pick up at?'}
          </span>
        </div>
      </div>

      <div className="absolute inset-x-0 bottom-0 rounded-t-sheet bg-white px-4 pt-3 pb-5 shadow-sheet">
        <div className="mx-auto mb-3 h-1 w-11 rounded-pill bg-neutral-200" />
        <p className="text-[12px] font-bold uppercase tracking-[0.1em] text-r-ink-3">
          {forDropoff ? 'Drop-off' : 'Pickup point'}
        </p>
        <p data-testid="pin-place" className="mt-1 truncate text-[21px] font-extrabold tracking-[-0.02em] text-r-ink">
          {moving ? 'Moving…' : title}
        </p>
        <p className="mt-0.5 truncate text-[14px] text-r-ink-2">
          {fromYou}
          {remainder}
        </p>
        <p className="mt-3 text-[13px] text-r-ink-3">Drag the map to move the pin.</p>
        <div className="mt-4">
          <Button
            label={forDropoff ? 'Choose this drop-off' : 'Choose this pickup'}
            shape="pill"
            size="large"
            disabled={moving}
            onClick={confirm}
          />
        </div>
      </div>
    </div>
  );
}
