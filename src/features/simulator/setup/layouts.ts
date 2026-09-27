import type { GeoPoint } from '../../../shared/location/location-store';
import type { Role } from '../../../shared/tab/types';
import type { MapView } from '../map-view';
import type { RegisteredTab } from '../tab-registry';

// Named scenes: where each test account stands (and whether each driver is online), keyed by
// account email so a layout outlives the tabs it was saved from. Kept per browser.

export interface LayoutActor {
  email: string;
  role: Role;
  lat: number;
  lng: number;
  /** Drivers only. */
  online?: boolean;
}

export interface Layout {
  name: string;
  savedAt: number;
  view: MapView;
  actors: LayoutActor[];
}

const STORAGE_KEY = 'goride:sim-layouts';

/** A driver's activity says whether it's online ("offline" is the only offline state). */
const isOnline = (tab: RegisteredTab) => tab.activity !== null && tab.activity !== 'offline';

export function captureLayout(name: string, tabs: RegisteredTab[], view: MapView, now: number): Layout {
  const actors = tabs.flatMap((tab): LayoutActor[] => {
    if (!tab.email || !tab.role || !tab.location) return [];
    const actor: LayoutActor = { email: tab.email, role: tab.role, lat: tab.location.lat, lng: tab.location.lng };
    if (tab.role === 'driver') actor.online = isOnline(tab);
    return [actor];
  });
  return { name, savedAt: now, view, actors };
}

export interface LoadPlan {
  moves: { tabId: string; point: GeoPoint }[];
  /** Drivers whose online state differs from the layout's. */
  online: { tab: RegisteredTab; online: boolean }[];
  /** Tabs left where they are: on a trip, or on browser GPS. */
  kept: RegisteredTab[];
  missing: LayoutActor[];
}

export function planLoad(layout: Layout, tabs: RegisteredTab[]): LoadPlan {
  const plan: LoadPlan = { moves: [], online: [], kept: [], missing: [] };
  for (const actor of layout.actors) {
    const tab = tabs.find((t) => t.email === actor.email && t.role === actor.role);
    if (!tab) {
      plan.missing.push(actor);
      continue;
    }
    if (tab.driverTrip || tab.locationSource !== 'simulated') {
      plan.kept.push(tab);
      continue;
    }
    plan.moves.push({ tabId: tab.tabId, point: { lat: actor.lat, lng: actor.lng } });
    if (actor.role === 'driver' && actor.online !== undefined && actor.online !== isOnline(tab)) {
      plan.online.push({ tab, online: actor.online });
    }
  }
  return plan;
}

const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

function isLayout(value: unknown): value is Layout {
  if (!value || typeof value !== 'object') return false;
  const l = value as Partial<Layout>;
  return (
    typeof l.name === 'string' &&
    l.name.trim() !== '' &&
    isNumber(l.savedAt) &&
    !!l.view &&
    isNumber(l.view.zoom) &&
    isNumber(l.view.center?.lat) &&
    isNumber(l.view.center?.lng) &&
    Array.isArray(l.actors) &&
    l.actors.every(
      (a) =>
        typeof a?.email === 'string' &&
        (a.role === 'rider' || a.role === 'driver') &&
        isNumber(a.lat) &&
        isNumber(a.lng) &&
        (a.online === undefined || typeof a.online === 'boolean'),
    )
  );
}

/** Layouts from an exported file: one layout or a list of them. */
export function parseLayouts(json: string): Layout[] {
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    throw new Error('That file isn’t JSON.');
  }
  const list = Array.isArray(value) ? value : [value];
  if (list.length === 0 || !list.every(isLayout)) throw new Error('That file isn’t a simulator layout export.');
  return list;
}

export function readLayouts(): Layout[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? parseLayouts(raw) : [];
  } catch {
    return [];
  }
}

export function writeLayouts(layouts: Layout[]): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(layouts));
  } catch {
    // Storage full or blocked: layouts still work until the page reloads.
  }
}

/** Save under a name, replacing a layout with the same name; newest first. */
export function upsertLayout(layouts: Layout[], layout: Layout): Layout[] {
  return [layout, ...layouts.filter((l) => l.name !== layout.name)];
}
