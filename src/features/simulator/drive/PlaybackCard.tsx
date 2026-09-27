import { Loader2, Navigation, Pause, Play, Square } from 'lucide-react';

import { formatKm, formatMinutesShort } from '../../../shared/lib/format';
import { useNow } from '../../../shared/lib/use-now';
import { positionOnRoute, profileFor } from '../../../shared/route/nav-route';
import { remainingFrom } from '../../../shared/route/profile';
import { SPEED_FACTORS } from '../../../shared/tab/types';
import type { RegisteredTab } from '../tab-registry';
import { driveLeg, legForPhase, useDriveStatus } from './drive-actions';
import { legLabel, usePlaybackStore, type PlaybackStatus } from './playback-store';

// Under a driver on a trip in the tab list: the drive in progress (leg, progress, what's
// left at the chosen speed) with speed, pause and stop — or a button to start the leg.

const STATUS_LABEL: Record<PlaybackStatus, string> = {
  driving: 'Driving',
  paused: 'Paused',
  held: 'Held · tab not responding',
  arrived: 'Arrived',
};

export function PlaybackCard({ tab }: { tab: RegisteredTab }) {
  const trip = tab.driverTrip;
  const playback = usePlaybackStore((s) => s.playbacks[tab.tabId]);
  const pending = useDriveStatus((s) => s.pending[tab.tabId]);
  const error = useDriveStatus((s) => s.errors[tab.tabId]);
  const now = useNow(1_000);
  if (!trip) return null;

  const leg = legForPhase(trip.phase);
  const current = playback?.route.requestId === trip.requestId && playback.route.leg === leg ? playback : null;
  const actions = usePlaybackStore.getState();

  let body = null;
  if (current) {
    const profile = profileFor(current.route);
    const position = positionOnRoute(current.route, now);
    const left = remainingFrom(profile, position.metres);
    const percent = profile.totalMetres > 0 ? Math.round((position.metres / profile.totalMetres) * 100) : 100;
    const running = current.status === 'driving';
    body = (
      <>
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-[12px] font-bold text-neutral-900">
            {legLabel(current.route.leg)} · {STATUS_LABEL[current.status]}
          </p>
          {current.status !== 'arrived' && (
            <p data-testid="playback-left" className="shrink-0 text-[12px] text-neutral-600">
              {formatKm(left.metres / 1000)} · {formatMinutesShort(left.seconds / 60 / current.route.speedFactor)}
            </p>
          )}
        </div>
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-pill bg-neutral-200">
          <div className="h-full rounded-pill bg-[#4f46e5]" style={{ width: `${percent}%` }} />
        </div>
        <div className="mt-2 flex items-center gap-1.5">
          <div className="flex rounded-lg bg-neutral-100 p-0.5" role="group" aria-label="Playback speed">
            {SPEED_FACTORS.map((factor) => (
              <button
                key={factor}
                type="button"
                aria-pressed={current.route.speedFactor === factor}
                onClick={() => actions.setSpeed(tab.tabId, factor)}
                className={`rounded-md px-2 py-0.5 text-[12px] font-bold ${current.route.speedFactor === factor ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-500 hover:text-neutral-900'}`}
              >
                ×{factor}
              </button>
            ))}
          </div>
          <span className="flex-1" />
          {current.status !== 'arrived' && (
            <button
              type="button"
              aria-label={running ? 'Pause' : 'Resume'}
              onClick={() => (running ? actions.pause(tab.tabId) : actions.resume(tab.tabId))}
              className="flex h-7 w-7 items-center justify-center rounded-lg bg-neutral-900 text-white hover:bg-neutral-700"
            >
              {running ? <Pause size={14} /> : <Play size={14} />}
            </button>
          )}
          <button
            type="button"
            aria-label="Stop and clear the route"
            onClick={() => actions.stop(tab.tabId)}
            className="flex h-7 w-7 items-center justify-center rounded-lg border border-neutral-300 text-neutral-700 hover:bg-neutral-100"
          >
            <Square size={12} />
          </button>
        </div>
      </>
    );
  } else if (leg) {
    body = (
      <button
        type="button"
        disabled={Boolean(pending)}
        onClick={() => void driveLeg(tab.tabId, leg)}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#4f46e5] px-3 py-1.5 text-[12px] font-bold text-white hover:bg-[#4338ca] disabled:opacity-60"
      >
        {pending ? <Loader2 size={14} className="animate-spin" /> : <Navigation size={14} />}
        {pending ? 'Finding a route…' : leg === 'pickup' ? 'Drive to pickup' : 'Drive to drop-off'}
      </button>
    );
  }
  if (!body && !error) return null;

  return (
    <div data-testid={`playback-${tab.tabId}`} className="mx-2 -mt-1 rounded-b-xl border border-t-0 border-neutral-200 bg-white px-3 pt-2.5 pb-2.5">
      {body}
      {error && <p className="mt-1.5 text-[12px] font-semibold text-danger-600">{error}</p>}
    </div>
  );
}
