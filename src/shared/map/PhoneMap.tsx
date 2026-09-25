import { AdvancedMarker, Map, useMap } from '@vis.gl/react-google-maps';
import { Car, Crosshair, User } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';

import type { GeoPoint } from '../location/location-store';

// Full-bleed map for the phone screens. Follows the tab's own position until the user
// pans away; the re-centre button resumes following. Marker content is styled inline:
// Google's unlayered map CSS overrides Tailwind 4's layered utilities.

// Kuala Lumpur city centre — go-ride-driver-app's HomeMap fallback.
const FALLBACK: GeoPoint = { lat: 3.139, lng: 101.6869 };
const MAP_ID = 'DEMO_MAP_ID';

const SELF_STYLE = {
  driver: { color: '#4f46e5', halo: 'rgba(79,70,229,0.18)', Icon: Car },
  rider: { color: '#00a04a', halo: 'rgba(0,160,74,0.18)', Icon: User },
} as const;

function Follow({ position, following }: { position: GeoPoint | null; following: boolean }) {
  const map = useMap();
  useEffect(() => {
    if (map && position && following) map.panTo(position);
  }, [map, position, following]);
  return null;
}

interface PhoneMapProps {
  position: GeoPoint | null;
  self: 'driver' | 'rider';
  /** Vertical space covered by the bottom sheet, so the re-centre button clears it. */
  bottomInset?: number;
  children?: ReactNode;
}

export function PhoneMap({ position, self, bottomInset = 0, children }: PhoneMapProps) {
  const [following, setFollowing] = useState(true);
  const [initialCenter] = useState(() => position ?? FALLBACK);
  const style = SELF_STYLE[self];
  const Icon = style.Icon;

  return (
    <div className="absolute inset-0">
      <Map
        mapId={MAP_ID}
        defaultCenter={initialCenter}
        defaultZoom={15}
        gestureHandling="greedy"
        disableDefaultUI
        clickableIcons={false}
        onDragstart={() => setFollowing(false)}
        className="h-full w-full"
      >
        {position && (
          <AdvancedMarker position={position} zIndex={1000} anchorLeft="-50%" anchorTop="-50%">
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: 999,
                background: style.halo,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 999,
                  background: style.color,
                  border: '3px solid #fff',
                  boxShadow: '0 4px 14px rgba(16,22,20,0.25)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#fff',
                }}
              >
                <Icon size={16} strokeWidth={2.4} />
              </div>
            </div>
          </AdvancedMarker>
        )}
        {children}
        <Follow position={position} following={following} />
      </Map>

      {position && !following && (
        <button
          type="button"
          aria-label="Re-centre on my location"
          onClick={() => setFollowing(true)}
          style={{ bottom: bottomInset + 16 }}
          className="absolute right-4 flex h-11 w-11 items-center justify-center rounded-full bg-white text-neutral-800 shadow-float"
        >
          <Crosshair size={20} />
        </button>
      )}
    </div>
  );
}
