export interface Ticker {
  stop: () => void;
}

export type CreateTicker = (onTick: () => void) => Ticker;

/** A 4 Hz ticker in a worker (not throttled in background tabs); plain setInterval where workers don't exist (tests). */
export const createWorkerTicker: CreateTicker = (onTick) => {
  if (typeof Worker === 'undefined') {
    const interval = setInterval(onTick, 250);
    return { stop: () => clearInterval(interval) };
  }
  const worker = new Worker(new URL('./ticker.worker.ts', import.meta.url), { type: 'module' });
  worker.onmessage = () => onTick();
  return { stop: () => worker.terminate() };
};
