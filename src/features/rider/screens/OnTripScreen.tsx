import { Polyline } from '@vis.gl/react-google-maps';
import { Activity, MessageSquare, Plus, X } from 'lucide-react';
import { useState } from 'react';

import { useNow } from '../../../shared/lib/use-now';
import { PIN_COLORS } from '../../../shared/map/map-colors';
import { AppMap, FitBounds, PlaceDot } from '../../../shared/map/map-pieces';
import { CancelTripSheet } from '../components/CancelTripSheet';
import type { RiderTrip } from '../trip/trip-model';
import { tripProgress } from '../trip/trip-progress';

// R06 On trip. The gateway stops sending the driver's position at trip start, so the
// map shows the booked route (no car) and the arrival time, minutes and km left are
// estimated from the start time and the booked route — labelled as such.

const SHEET_HEIGHT = 400;

const clock = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });

export function OnTripScreen({ trip }: { trip: RiderTrip }) {
  const now = useNow(5_000);
  const [cancelOpen, setCancelOpen] = useState(false);
  const progress = tripProgress(trip, now);
  const driver = trip.driver;

  return (
    <div className="relative flex-1 overflow-hidden bg-r-map-land">
      <div className="absolute inset-x-0 top-0" style={{ bottom: SHEET_HEIGHT - 24 }}>
        <AppMap defaultCenter={trip.dropoff} defaultZoom={13}>
          <PlaceDot position={trip.pickup} kind="pickup" />
          <PlaceDot position={trip.dropoff} kind="dropoff" />
          {trip.route?.polyline ? (
            <Polyline encodedPath={trip.route.polyline} strokeColor={PIN_COLORS.route} strokeWeight={5} strokeOpacity={0.95} />
          ) : (
            <Polyline path={[trip.pickup, trip.dropoff]} strokeColor={PIN_COLORS.route} strokeWeight={4} strokeOpacity={0.7} geodesic />
          )}
          <FitBounds points={[trip.pickup, trip.dropoff]} padding={{ top: 80, bottom: 50, left: 50, right: 50 }} />
        </AppMap>
      </div>

      <div className="absolute top-4 left-4 flex items-center gap-2 rounded-pill bg-white px-4 py-2.5 text-[14px] font-bold text-r-ink shadow-float">
        <Activity size={16} className="text-primary-700" /> On route · estimated
      </div>

      <div
        className="absolute inset-x-0 bottom-0 overflow-y-auto rounded-t-sheet bg-white px-4 pt-3 pb-5 shadow-sheet"
        style={{ maxHeight: SHEET_HEIGHT + 40 }}
      >
        <div className="mx-auto mb-3 h-1 w-11 rounded-pill bg-neutral-200" />
        <p className="text-[12px] font-bold uppercase tracking-[0.1em] text-r-ink-3">
          {progress.overdue ? 'Arriving soon' : 'Arriving'}
        </p>
        <div className="flex items-baseline gap-3">
          <p data-testid="arrival-clock" className="text-[40px] leading-tight font-extrabold tracking-[-0.03em] text-r-ink">
            {clock(progress.arrivesAt)}
          </p>
          <p className="text-[15px] text-r-ink-2">
            {Math.round(progress.remainingMinutes)} min · {progress.remainingKm.toFixed(1)} km left
          </p>
        </div>

        <div className="mt-3 h-1.5 overflow-hidden rounded-pill bg-r-line">
          <div className="h-full rounded-pill bg-primary-500 transition-[width] duration-1000" style={{ width: `${progress.fraction * 100}%` }} />
        </div>
        <div className="mt-1.5 flex justify-between gap-3 text-[13px] text-r-ink-3">
          <span className="truncate">
            {trip.pickup.label ?? 'Pickup'}
            {trip.startedAt ? ` · ${clock(trip.startedAt)}` : ''}
          </span>
          <span className="truncate text-right">{trip.dropoff.label ?? 'Drop-off'}</span>
        </div>

        <div className="mt-4 flex items-center gap-3 rounded-card border border-r-line px-4 py-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-pill bg-primary-50 text-[15px] font-extrabold text-primary-700">
            {(driver?.name ?? 'D')
              .split(/\s+/)
              .map((part) => part.charAt(0))
              .join('')
              .slice(0, 2)
              .toUpperCase()}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[16px] font-extrabold text-r-ink">
              {driver?.name ?? 'Your driver'}
              {driver?.vehiclePlate ? ` · ${driver.vehiclePlate}` : ''}
            </p>
            <p className="truncate text-[13px] text-r-ink-2">
              {[driver?.vehicleModel, driver?.vehicleColor?.toLowerCase()].filter(Boolean).join(' · ') || 'Vehicle'}
            </p>
          </div>
          <button type="button" disabled aria-label="Message driver" title="Not available in the web simulator" className="p-2 text-r-ink-2">
            <MessageSquare size={20} />
          </button>
        </div>

        <div className="mt-4 flex gap-3">
          <button
            type="button"
            disabled
            title="Stops aren’t supported by the backend yet"
            className="flex flex-1 items-center justify-center gap-2 rounded-pill border border-r-line py-3.5 text-[15px] font-bold text-r-ink opacity-70"
          >
            <Plus size={18} /> Add a stop
          </button>
          <button
            type="button"
            onClick={() => setCancelOpen(true)}
            className="flex flex-1 items-center justify-center gap-2 rounded-pill bg-r-pin py-3.5 text-[15px] font-bold text-white"
          >
            <X size={18} /> Cancel trip
          </button>
        </div>
      </div>

      <CancelTripSheet open={cancelOpen} requestId={trip.requestId} stage="in_progress" onDismiss={() => setCancelOpen(false)} />
    </div>
  );
}
