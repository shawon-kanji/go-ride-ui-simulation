import { CircleCheck } from 'lucide-react';
import { useNavigate } from 'react-router';

import { Card } from '../../../shared/ui/Card';
import { Button } from '../../../shared/ui/Button';
import { usePlaceLabel } from '../../../shared/places/places';
import { useCurrentTripQuery } from '../api/queries';
import { formatMoney } from '../format';

// Temporary until Phase 4 builds D09 (trip + cash collection) and D10 (cancel).
// Shows what driver-request-handler returned for the accepted offer.

function Place({ lat, lng }: { lat: number; lng: number }) {
  const { data } = usePlaceLabel('driver', lat, lng);
  return <>{data ?? `${lat.toFixed(4)}, ${lng.toFixed(4)}`}</>;
}

export function TripAssignedScreen() {
  const navigate = useNavigate();
  const { data, isLoading } = useCurrentTripQuery();
  const trip = data?.ongoing_trip;
  const request = data?.trip_request;

  return (
    <div className="flex flex-1 flex-col overflow-hidden bg-neutral-50">
      <div className="bg-success-500 px-5 pt-[26px] pb-5 text-white">
        <CircleCheck size={28} />
        <h1 className="mt-2 text-[22px] font-extrabold tracking-[-0.01em]">
          {trip ? 'Trip assigned' : isLoading ? 'Loading trip…' : 'No active trip'}
        </h1>
        <p className="mt-1 text-[13px] text-white/85">
          The trip screen (D09 · start with PIN, cash collection) arrives in Phase 4.
        </p>
      </div>

      <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-5 pt-4 pb-6">
        {trip && (
          <Card>
            <p className="text-[12px] font-bold uppercase tracking-[0.08em] text-neutral-500">
              Status · {trip.status.replace(/_/g, ' ')}
            </p>
            {request?.fare && (
              <p className="mt-2 text-[26px] font-extrabold tracking-[-0.02em]" data-testid="trip-fare">
                {formatMoney(request.fare.total_fare, request.fare.currency_code)}
              </p>
            )}
            <div className="mt-3 grid grid-cols-[12px_1fr] gap-x-2.5 gap-y-2 text-[14px] font-bold">
              <span className="mt-[7px] h-2 w-2 rounded-full bg-primary-500" />
              <p>
                <Place lat={trip.pickup_lat} lng={trip.pickup_lng} />
              </p>
              <span className="mt-[7px] h-2 w-2 rounded-full bg-danger-500" />
              <p>
                <Place lat={trip.dropoff_lat} lng={trip.dropoff_lng} />
              </p>
            </div>
            <p className="mt-3 font-mono text-[12px] text-neutral-400">trip {trip.trip_id}</p>
          </Card>
        )}
        <div className="mt-auto">
          <Button label="Back to map" variant="ghost" shape="pill" onClick={() => navigate('/driver')} />
        </div>
      </div>
    </div>
  );
}
