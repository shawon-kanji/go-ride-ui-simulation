import { AdvancedMarker, Map, useMap, type MapProps } from '@vis.gl/react-google-maps';
import { Car } from 'lucide-react';
import { useEffect, type ReactNode } from 'react';

import type { GeoPoint } from '../location/location-store';
import { PIN_COLORS } from './map-colors';

// Map building blocks for the phone screens (rider and driver). Marker content is styled inline: Google's
// unlayered map CSS beats Tailwind 4's layered utilities inside the map.

const MAP_ID = 'DEMO_MAP_ID';


type AppMapProps = Omit<MapProps, 'mapId'> & { children?: ReactNode };

/** Full-bleed map without Google's controls, as the phone screens use it. */
export function AppMap({ children, ...props }: AppMapProps) {
  return (
    <Map
      mapId={MAP_ID}
      gestureHandling="greedy"
      disableDefaultUI
      clickableIcons={false}
      className="h-full w-full"
      {...props}
    >
      {children}
    </Map>
  );
}

/** Pickup (blue) or drop-off (red) dot with a white ring. */
export function PlaceDot({ position, kind }: { position: GeoPoint; kind: 'pickup' | 'dropoff' }) {
  return (
    <AdvancedMarker position={position} anchorLeft="-50%" anchorTop="-50%" zIndex={kind === 'pickup' ? 20 : 10}>
      <div
        style={{
          width: 18,
          height: 18,
          borderRadius: 999,
          background: PIN_COLORS[kind],
          border: '3px solid #fff',
          boxShadow: '0 2px 8px rgba(16,22,20,0.3)',
        }}
      />
    </AdvancedMarker>
  );
}

/** The assigned driver: a dark rounded car badge (the handoff's black marker). */
export function CarMarker({ position, color = PIN_COLORS.car }: { position: GeoPoint; color?: string }) {
  return (
    <AdvancedMarker position={position} anchorLeft="-50%" anchorTop="-50%" zIndex={30}>
      <div
        data-testid="driver-marker"
        style={{
          width: 34,
          height: 26,
          borderRadius: 8,
          background: color,
          color: '#fff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          border: '2px solid #fff',
          boxShadow: '0 4px 14px rgba(16,22,20,0.3)',
        }}
      >
        <Car size={16} strokeWidth={2.4} />
      </div>
    </AdvancedMarker>
  );
}

/** R04's "searching" rings around the pickup. */
export function SearchPulse({ position }: { position: GeoPoint }) {
  const ring = (size: number, delay: string) => ({
    position: 'absolute' as const,
    left: '50%',
    top: '50%',
    width: size,
    height: size,
    marginLeft: -size / 2,
    marginTop: -size / 2,
    borderRadius: 999,
    background: 'rgba(0,160,74,0.14)',
    border: '1.5px solid rgba(0,160,74,0.35)',
    animation: `goride-pulse 2.4s ease-out ${delay} infinite`,
  });
  return (
    <AdvancedMarker position={position} anchorLeft="-50%" anchorTop="-50%">
      <div style={{ position: 'relative', width: 240, height: 240 }}>
        <div style={ring(240, '0s')} />
        <div style={ring(240, '1.2s')} />
        <div
          style={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            width: 22,
            height: 22,
            marginLeft: -11,
            marginTop: -11,
            borderRadius: 999,
            background: PIN_COLORS.route,
            border: '3px solid #fff',
            boxShadow: '0 2px 8px rgba(16,22,20,0.3)',
          }}
        />
      </div>
    </AdvancedMarker>
  );
}

interface FitBoundsProps {
  points: GeoPoint[];
  /** Pixels kept clear on each side, e.g. the bottom sheet's height at the bottom. */
  padding?: google.maps.Padding;
  /** Zoom used when there is only one point. */
  singleZoom?: number;
}

/** Keeps every point in view; re-fits when the points change. */
export function FitBounds({ points, padding, singleZoom = 16 }: FitBoundsProps) {
  const map = useMap();
  const key = points.map((p) => `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`).join('|');
  const paddingKey = JSON.stringify(padding ?? null);

  useEffect(() => {
    if (!map || points.length === 0) return;
    if (points.length === 1) {
      map.setCenter(points[0]);
      map.setZoom(singleZoom);
      return;
    }
    const bounds = new google.maps.LatLngBounds();
    for (const point of points) bounds.extend(point);
    map.fitBounds(bounds, padding ?? 48);
    // `key` and `paddingKey` stand in for the arrays, which are new every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, key, paddingKey, singleZoom]);

  return null;
}
