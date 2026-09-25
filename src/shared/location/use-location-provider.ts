import { useEffect } from 'react';

import { subscribeBus } from '../tab/bus';
import { getTabId } from '../tab/tab-identity';
import { useLocationStore } from './location-store';

// Mounted once per rider/driver tab. Feeds the location store from whichever source
// is active: simulator commands addressed to this tab, or the browser's geolocation.

export function useLocationProvider(): void {
  const source = useLocationStore((s) => s.source);

  // Simulator commands are accepted whatever the source, so the last simulated fix is
  // remembered; the store only applies it while the source is 'simulated'.
  useEffect(
    () =>
      subscribeBus((message) => {
        if (message.type === 'set-location' && message.tabId === getTabId()) {
          useLocationStore.getState().applySimulated({ lat: message.lat, lng: message.lng });
        }
      }),
    [],
  );

  useEffect(() => {
    if (source !== 'browser') return;
    if (!('geolocation' in navigator)) {
      useLocationStore.getState().setBrowserError('This browser has no geolocation.');
      return;
    }
    const watchId = navigator.geolocation.watchPosition(
      (fix) =>
        useLocationStore.getState().applyBrowserFix({
          lat: fix.coords.latitude,
          lng: fix.coords.longitude,
          accuracyM: fix.coords.accuracy,
        }),
      (error) => useLocationStore.getState().setBrowserError(error.message || 'Location unavailable.'),
      { enableHighAccuracy: true, maximumAge: 5_000 },
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, [source]);
}
