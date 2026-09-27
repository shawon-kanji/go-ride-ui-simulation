import { Polyline } from '@vis.gl/react-google-maps';
import { Fragment } from 'react';

import { useNow } from '../../../shared/lib/use-now';
import { positionOnRoute, profileFor, splitRoute } from '../../../shared/route/nav-route';
import { usePlaybackStore } from './playback-store';

// Every route being driven: the part already driven in grey, what's left in the driver indigo.

const COLORS = { travelled: '#9ca3af', remaining: '#4f46e5' } as const;

export function RouteOverlay() {
  const playbacks = usePlaybackStore((s) => s.playbacks);
  const now = useNow(500);

  return (
    <>
      {Object.values(playbacks).map(({ tabId, route }) => {
        const profile = profileFor(route);
        const { travelled, remaining } = splitRoute(profile, positionOnRoute(route, now).metres);
        return (
          <Fragment key={tabId}>
            <Polyline path={travelled} strokeColor={COLORS.travelled} strokeOpacity={0.8} strokeWeight={5} />
            <Polyline path={remaining} strokeColor={COLORS.remaining} strokeOpacity={0.9} strokeWeight={5} />
          </Fragment>
        );
      })}
    </>
  );
}
