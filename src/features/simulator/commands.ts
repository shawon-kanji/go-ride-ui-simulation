import type { GeoPoint } from '../../shared/location/location-store';
import { postBus } from '../../shared/tab/bus';
import { useTabRegistry } from './tab-registry';

/**
 * Moves a tab's simulated GPS. The marker moves immediately (optimistic); the tab's
 * next presence message confirms the new position.
 */
export function moveTab(tabId: string, point: GeoPoint): void {
  postBus({ type: 'set-location', tabId, lat: point.lat, lng: point.lng });
  useTabRegistry.setState((state) => {
    const tab = state.tabs[tabId];
    if (!tab || tab.locationSource !== 'simulated') return state;
    return { tabs: { ...state.tabs, [tabId]: { ...tab, location: point } } };
  });
}
