import { Download, Trash2, Upload } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import type { GeoPoint } from '../../../shared/location/location-store';
import { postBus } from '../../../shared/tab/bus';
import { moveTab } from '../commands';
import { readMapView } from '../map-view';
import { useTabRegistry } from '../tab-registry';
import { captureLayout, parseLayouts, planLoad, readLayouts, upsertLayout, writeLayouts, type Layout, type LayoutActor } from './layouts';
import { loginPath } from './quick-setup';
import { useOnlineRequests } from './use-online-requests';

// Sidebar: save where every test account stands (and which drivers are online) under a name,
// and bring it back later. Accounts without an open tab can be opened from here; they're put
// in place as soon as they sign in.

const AWAIT_MS = 30_000;
/** Lets the tab apply its new position before it's asked to go online (which needs one). */
const ONLINE_AFTER_MOVE_MS = 600;

interface Awaiting {
  actors: LayoutActor[];
  until: number;
}

export function LayoutsCard({ onFocus }: { onFocus: (point: GeoPoint) => void }) {
  const [layouts, setLayouts] = useState<Layout[]>(readLayouts);
  const [name, setName] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [missing, setMissing] = useState<LayoutActor[]>([]);
  const [awaiting, setAwaiting] = useState<Awaiting | null>(null);
  const onlineRequests = useOnlineRequests();
  const fileInput = useRef<HTMLInputElement>(null);

  const save = (next: Layout[]) => {
    setLayouts(next);
    writeLayouts(next);
  };

  const saveCurrent = () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setMessage('Name the layout first.');
      return;
    }
    const layout = captureLayout(trimmed, Object.values(useTabRegistry.getState().tabs), readMapView(), Date.now());
    if (layout.actors.length === 0) {
      setMessage('No signed-in tab is on the map yet.');
      return;
    }
    save(upsertLayout(layouts, layout));
    setName('');
    setMessage(`Saved “${trimmed}” with ${layout.actors.length} account${layout.actors.length === 1 ? '' : 's'}.`);
  };

  const load = (layout: Layout) => {
    const plan = planLoad(layout, Object.values(useTabRegistry.getState().tabs));
    onlineRequests.clear();
    for (const move of plan.moves) moveTab(move.tabId, move.point);
    onFocus(layout.view.center);
    const goOnline = plan.online.filter((o) => o.online).map((o) => o.tab);
    const goOffline = plan.online.filter((o) => !o.online).map((o) => o.tab);
    setTimeout(() => {
      if (goOnline.length > 0) onlineRequests.request(goOnline, true);
      for (const tab of goOffline) postBus({ type: 'set-online', tabId: tab.tabId, online: false });
    }, ONLINE_AFTER_MOVE_MS);
    setMissing(plan.missing);
    setAwaiting(null);
    setMessage(
      `Loaded “${layout.name}”: moved ${plan.moves.length}` +
        (plan.kept.length > 0 ? `, left ${plan.kept.length} on a trip or browser GPS alone` : '') +
        (plan.missing.length > 0 ? `, ${plan.missing.length} not open.` : '.'),
    );
  };

  const openMissing = () => {
    for (const actor of missing) window.open(loginPath(actor.role, actor.email), '_blank', 'noopener');
    setAwaiting({ actors: missing, until: Date.now() + AWAIT_MS });
    setMissing([]);
  };

  // Put opened accounts in place as they sign in (watched on the registry, with a timeout).
  useEffect(() => {
    if (!awaiting) return;
    const placed = new Set<string>();
    const check = () => {
      const all = Object.values(useTabRegistry.getState().tabs);
      const remaining: LayoutActor[] = [];
      for (const actor of awaiting.actors) {
        const tab = all.find((t) => t.email === actor.email && t.role === actor.role);
        if (!tab) {
          remaining.push(actor);
          continue;
        }
        if (placed.has(actor.email)) continue;
        placed.add(actor.email);
        moveTab(tab.tabId, { lat: actor.lat, lng: actor.lng });
        if (actor.online) {
          setTimeout(() => postBus({ type: 'set-online', tabId: tab.tabId, online: true }), ONLINE_AFTER_MOVE_MS);
        }
      }
      if (remaining.length === 0) {
        setAwaiting(null);
      } else if (Date.now() >= awaiting.until) {
        setAwaiting(null);
        setMessage(`${remaining.length} account${remaining.length === 1 ? '' : 's'} didn’t sign in — allow pop-ups for ${window.location.host}.`);
      }
    };
    const unsubscribe = useTabRegistry.subscribe(check);
    const interval = setInterval(check, 1_000);
    return () => {
      unsubscribe();
      clearInterval(interval);
    };
  }, [awaiting]);

  const exportLayout = (layout: Layout) => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(layout, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `goride-layout-${layout.name.replace(/[^\w-]+/g, '-').toLowerCase()}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const importFile = async (file: File) => {
    try {
      const imported = parseLayouts(await file.text());
      save(imported.reduce(upsertLayout, layouts));
      setMessage(`Imported ${imported.map((l) => `“${l.name}”`).join(', ')}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Couldn’t import that file.');
    }
  };

  return (
    <section data-testid="layouts" className="mt-3 rounded-control bg-white px-3 py-2.5 text-[13px] ring-1 ring-neutral-200">
      <div className="flex items-center justify-between">
        <p className="font-bold text-neutral-900">Layouts</p>
        <button
          type="button"
          onClick={() => fileInput.current?.click()}
          className="flex items-center gap-1 text-[12px] font-semibold text-neutral-500 hover:text-neutral-900"
        >
          <Upload size={13} /> Import
        </button>
        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          data-testid="layout-import"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void importFile(file);
            e.target.value = '';
          }}
        />
      </div>
      <form
        className="mt-2 flex gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          saveCurrent();
        }}
      >
        <input
          aria-label="Layout name"
          placeholder="Name this scene"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="min-w-0 flex-1 rounded-md border border-neutral-300 px-2 py-1"
        />
        <button type="submit" data-testid="layout-save" className="rounded-md bg-neutral-900 px-2.5 py-1 font-bold text-white hover:bg-neutral-700">
          Save
        </button>
      </form>

      {layouts.length > 0 && (
        <ul className="mt-2 divide-y divide-neutral-100">
          {layouts.map((layout) => (
            <li key={layout.name} className="flex items-center gap-1.5 py-1.5" data-testid="layout-row">
              <p className="min-w-0 flex-1 truncate">
                <span className="font-semibold text-neutral-900">{layout.name}</span>{' '}
                <span className="text-neutral-500">· {layout.actors.length}</span>
              </p>
              <button
                type="button"
                onClick={() => load(layout)}
                className="rounded-md border border-neutral-300 px-2 py-0.5 font-semibold text-neutral-800 hover:bg-neutral-100"
              >
                Load
              </button>
              <button
                type="button"
                aria-label={`Export ${layout.name}`}
                onClick={() => exportLayout(layout)}
                className="rounded p-1 text-neutral-400 hover:text-neutral-900"
              >
                <Download size={14} />
              </button>
              <button
                type="button"
                aria-label={`Delete ${layout.name}`}
                onClick={() => save(layouts.filter((l) => l !== layout))}
                className="rounded p-1 text-neutral-400 hover:text-danger-600"
              >
                <Trash2 size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}

      {missing.length > 0 && (
        <div className="mt-2 rounded-md bg-warning-50 px-2 py-1.5 text-[12px] text-warning-700">
          Not open: {missing.map((m) => m.email.split('@')[0]).join(', ')}{' '}
          <button type="button" data-testid="layout-open-missing" onClick={openMissing} className="font-bold underline">
            Open and place them
          </button>
        </div>
      )}
      {awaiting && <p className="mt-2 text-[12px] text-neutral-500">Waiting for {awaiting.actors.length} to sign in…</p>}
      {message && (
        <p data-testid="layout-message" className="mt-2 text-[12px] text-neutral-600">
          {message}
        </p>
      )}
      {onlineRequests.summary && (
        <p data-testid="layout-online" className="mt-1 text-[12px] text-neutral-600">
          {onlineRequests.summary}
        </p>
      )}
    </section>
  );
}
