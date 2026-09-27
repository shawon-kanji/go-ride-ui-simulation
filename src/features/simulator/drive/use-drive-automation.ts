import { useEffect, useRef } from 'react';
import { create } from 'zustand';

import { postBus, subscribeBus } from '../../../shared/tab/bus';
import { STALE_AFTER_MS, useTabRegistry } from '../tab-registry';
import { driveLeg, legForPhase } from './drive-actions';
import { usePlaybackStore } from './playback-store';

// Mounted on the simulator page:
//   - a playback whose trip is over (completed, cancelled, redispatched) stops and its
//     route is un-shared
//   - auto-drive: when a driver accepts, drive to the pickup; when the trip starts, drive
//     to the drop-off
//   - D09's Navigate button (drive-request) starts, or resumes, the current leg

const AUTO_DRIVE_KEY = 'goride:sim-auto-drive';
/** A driver tab announces its trip a moment after it boots; don't treat that gap as "trip over". */
const TRIP_GONE_GRACE_MS = 4_000;

function readAutoDrive(): boolean {
  try {
    return window.localStorage.getItem(AUTO_DRIVE_KEY) === '1';
  } catch {
    return false;
  }
}

export const useAutoDrive = create<{ on: boolean; setOn: (on: boolean) => void }>((set) => ({
  on: readAutoDrive(),
  setOn: (on) => {
    try {
      window.localStorage.setItem(AUTO_DRIVE_KEY, on ? '1' : '0');
    } catch {
      // The toggle still works for this page load.
    }
    set({ on });
  },
}));

export function useDriveAutomation(): void {
  const tabs = useTabRegistry((s) => s.tabs);
  const autoDrive = useAutoDrive((s) => s.on);
  const tripGoneSince = useRef(new Map<string, number>());
  const attempted = useRef(new Set<string>());

  useEffect(() => {
    const { playbacks, stop } = usePlaybackStore.getState();
    const now = Date.now();
    for (const playback of Object.values(playbacks)) {
      const tab = tabs[playback.tabId];
      if (!tab) continue; // gone for now: the supervisor holds it
      const trip = tab.driverTrip;
      const same = trip && trip.requestId === playback.route.requestId && tab.userId === playback.route.driverId;
      if (same) {
        tripGoneSince.current.delete(playback.tabId);
        continue;
      }
      const since = tripGoneSince.current.get(playback.tabId) ?? now;
      tripGoneSince.current.set(playback.tabId, since);
      if (now - since >= TRIP_GONE_GRACE_MS) {
        tripGoneSince.current.delete(playback.tabId);
        stop(playback.tabId);
      }
    }
  }, [tabs]);

  useEffect(() => {
    if (!autoDrive) return;
    const now = Date.now();
    for (const tab of Object.values(tabs)) {
      const trip = tab.driverTrip;
      const leg = trip ? legForPhase(trip.phase) : null;
      if (!trip || !leg || !tab.userId || now - tab.lastSeen > STALE_AFTER_MS) continue;
      // Once per trip, driver and leg: a drive stopped by hand isn't restarted.
      const key = `${tab.tabId}:${trip.requestId}:${tab.userId}:${leg}`;
      if (attempted.current.has(key)) continue;
      attempted.current.add(key);
      const playback = usePlaybackStore.getState().playbacks[tab.tabId];
      if (playback?.route.requestId === trip.requestId && playback.route.leg === leg) continue;
      void driveLeg(tab.tabId, leg);
    }
  }, [tabs, autoDrive]);

  useEffect(
    () =>
      subscribeBus((message) => {
        if (message.type !== 'drive-request') return;
        postBus({ type: 'drive-ack', tabId: message.tabId, ok: true });
        const playback = usePlaybackStore.getState().playbacks[message.tabId];
        if (playback?.route.requestId === message.requestId && playback.route.leg === message.leg) {
          if (playback.status === 'paused' || playback.status === 'held') usePlaybackStore.getState().resume(message.tabId);
          return;
        }
        void driveLeg(message.tabId, message.leg).then((result) => {
          if (!result.ok) postBus({ type: 'drive-ack', tabId: message.tabId, ok: false, reason: result.reason });
        });
      }),
    [],
  );
}
