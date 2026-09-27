import { useEffect, useRef, useState } from 'react';

import { postBus, subscribeBus } from '../../../shared/tab/bus';
import { actorLabel, type RegisteredTab } from '../tab-registry';

// Asks driver tabs to go online/offline (set-online) and collects their answers into one line,
// e.g. "3 went online · Ravi: no location — place it first".

const ANSWER_TIMEOUT_MS = 8_000;

interface Batch {
  online: boolean;
  waiting: Set<string>;
  failures: { name: string; reason: string }[];
  succeeded: number;
}

export function useOnlineRequests() {
  const [batch, setBatch] = useState<Batch | null>(null);
  const names = useRef(new Map<string, string>());

  useEffect(
    () =>
      subscribeBus((message) => {
        if (message.type !== 'set-online-result') return;
        setBatch((current) => {
          if (!current || current.online !== message.online || !current.waiting.has(message.tabId)) return current;
          const waiting = new Set(current.waiting);
          waiting.delete(message.tabId);
          if (message.ok) return { ...current, waiting, succeeded: current.succeeded + 1 };
          const failure = { name: names.current.get(message.tabId) ?? 'driver', reason: message.reason ?? 'failed' };
          return { ...current, waiting, failures: [...current.failures, failure] };
        });
      }),
    [],
  );

  // Tabs that never answer (closed, or still loading an older build).
  useEffect(() => {
    if (!batch || batch.waiting.size === 0) return;
    const timer = setTimeout(() => {
      setBatch((current) => {
        if (!current || current.waiting.size === 0) return current;
        const silent = [...current.waiting].map((id) => ({ name: names.current.get(id) ?? 'driver', reason: 'no answer' }));
        return { ...current, waiting: new Set(), failures: [...current.failures, ...silent] };
      });
    }, ANSWER_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [batch]);

  const request = (drivers: RegisteredTab[], online: boolean) => {
    for (const tab of drivers) names.current.set(tab.tabId, actorLabel(tab));
    setBatch({ online, waiting: new Set(drivers.map((t) => t.tabId)), failures: [], succeeded: 0 });
    for (const tab of drivers) postBus({ type: 'set-online', tabId: tab.tabId, online });
  };

  let summary: string | null = null;
  if (batch) {
    const verb = batch.online ? 'online' : 'offline';
    summary =
      batch.waiting.size > 0
        ? `Asking ${batch.waiting.size} driver${batch.waiting.size === 1 ? '' : 's'} to go ${verb}…`
        : `${batch.succeeded} went ${verb}` +
          (batch.failures.length > 0 ? ` · ${batch.failures.map((f) => `${f.name}: ${f.reason}`).join(' · ')}` : '.');
  }

  return { request, summary, clear: () => setBatch(null) };
}
