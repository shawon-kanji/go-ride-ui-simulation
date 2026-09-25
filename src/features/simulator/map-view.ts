import type { GeoPoint } from '../../shared/location/location-store';

// Where the simulator map opens. The default matches go-ride-driver-app's HomeMap
// fallback (Kuala Lumpur city centre). The last camera position is remembered per
// browser in localStorage — a convenience only, safe to lose.

export const DEFAULT_CENTER: GeoPoint = { lat: 3.139, lng: 101.6869 };
export const DEFAULT_ZOOM = 14;

const VIEW_KEY = 'goride:simulator-view';

interface MapView {
  center: GeoPoint;
  zoom: number;
}

export function readMapView(): MapView {
  try {
    const raw = window.localStorage.getItem(VIEW_KEY);
    if (raw) {
      const view = JSON.parse(raw) as MapView;
      if (Number.isFinite(view.center?.lat) && Number.isFinite(view.center?.lng) && Number.isFinite(view.zoom)) {
        return view;
      }
    }
  } catch {
    // Fall through to the default view.
  }
  return { center: DEFAULT_CENTER, zoom: DEFAULT_ZOOM };
}

export function saveMapView(view: MapView): void {
  try {
    window.localStorage.setItem(VIEW_KEY, JSON.stringify(view));
  } catch {
    // Preference just won't persist.
  }
}
