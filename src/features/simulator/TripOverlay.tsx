import { AdvancedMarker, Polyline } from '@vis.gl/react-google-maps';
import { Fragment } from 'react';

import type { RegisteredTab } from './tab-registry';

// Each rider's live trip on the simulator map: pickup (blue) and drop-off (red) pins,
// a faint pickup → drop-off line, and a link from the assigned driver to where they're
// heading — the pickup, then (once the trip starts) the drop-off.
// The driver end uses that driver's own tab when it's open here (its true simulated
// position), else the last position the rider was told about.

const COLORS = { pickup: '#2563eb', dropoff: '#f4523b', link: '#00a04a', route: '#101614' } as const;

function Pin({ position, color, title }: { position: google.maps.LatLngLiteral; color: string; title: string }) {
  return (
    <AdvancedMarker position={position} anchorLeft="-50%" anchorTop="-50%" zIndex={50} title={title}>
      <div
        style={{
          width: 16,
          height: 16,
          borderRadius: 999,
          background: color,
          border: '3px solid #fff',
          boxShadow: '0 2px 8px rgba(16,22,20,0.3)',
        }}
      />
    </AdvancedMarker>
  );
}

export function TripOverlay({ tabs }: { tabs: RegisteredTab[] }) {
  const riders = tabs.filter((tab) => tab.role === 'rider' && tab.trip);

  return (
    <>
      {riders.map((rider) => {
        const trip = rider.trip!;
        const name = rider.name?.split(' ')[0] ?? 'Rider';
        const driverTab = trip.driverId ? tabs.find((t) => t.role === 'driver' && t.userId === trip.driverId) : undefined;
        // Before pickup the rider only hears driver_location; after it, only the driver's tab knows.
        const driverAt = driverTab?.location ?? (trip.phase === 'assigned' ? trip.driverFix : null);
        const linkTo = trip.phase === 'assigned' ? trip.pickup : trip.dropoff;
        return (
          <Fragment key={rider.tabId}>
            <Polyline
              path={[trip.pickup, trip.dropoff]}
              strokeColor={COLORS.route}
              strokeOpacity={0.35}
              strokeWeight={3}
              geodesic
            />
            {driverAt && (
              <Polyline
                path={[driverAt, linkTo]}
                strokeOpacity={0}
                icons={[
                  {
                    icon: { path: 'M 0,-1 0,1', strokeColor: COLORS.link, strokeOpacity: 1, strokeWeight: 4, scale: 3 },
                    offset: '0',
                    repeat: '14px',
                  },
                ]}
              />
            )}
            <Pin position={trip.pickup} color={COLORS.pickup} title={`${name}’s pickup · ${trip.phase}`} />
            <Pin position={trip.dropoff} color={COLORS.dropoff} title={`${name}’s drop-off`} />
          </Fragment>
        );
      })}
    </>
  );
}
