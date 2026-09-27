// Ticks for route playback. Browsers throttle timers in background tabs (to 1/s, and in
// Chrome to 1/min after 5 minutes hidden); a dedicated worker's timers aren't, and the
// simulator is usually in the background while you watch a phone tab. The worker only
// ticks — positions are computed from the wall clock, so a late tick never goes off-route.

const TICK_MS = 250;

setInterval(() => postMessage(Date.now()), TICK_MS);
