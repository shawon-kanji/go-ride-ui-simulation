import { Map, useMap } from '@vis.gl/react-google-maps';
import { MousePointerClick } from 'lucide-react';
import { useEffect, useState } from 'react';

import type { GeoPoint } from '../../shared/location/location-store';
import { ActorMarker } from './ActorMarker';
import { readMapView, saveMapView } from './map-view';
import { FoundPlaceMarker, PlaceSearch, type FoundPlace } from './PlaceSearch';
import { TripOverlay } from './TripOverlay';
import { actorLabel, type RegisteredTab } from './tab-registry';

// The simulator's map. Clicking the map moves the selected tab; markers can also be
// dragged. The search box (top left) jumps to a place and can move the selected tab there. `mapId` is required for Advanced Markers — DEMO_MAP_ID is Google's id for
// development use.

const MAP_ID = 'DEMO_MAP_ID';

interface SimulatorMapProps {
  tabs: RegisteredTab[];
  selected: RegisteredTab | null;
  focus: GeoPoint | null;
  isStale: (tab: RegisteredTab) => boolean;
  onSelect: (tabId: string | null) => void;
  onMove: (tabId: string, point: GeoPoint) => void;
}

function FocusController({ focus }: { focus: GeoPoint | null }) {
  const map = useMap();
  useEffect(() => {
    if (map && focus) map.panTo(focus);
  }, [map, focus]);
  return null;
}

export function SimulatorMap({ tabs, selected, focus, isStale, onSelect, onMove }: SimulatorMapProps) {
  const [initialView] = useState(readMapView);
  const [found, setFound] = useState<FoundPlace | null>(null);
  const selectedMovable = selected && selected.locationSource === 'simulated' && !isStale(selected);

  return (
    <div className="relative h-full w-full">
      <Map
        mapId={MAP_ID}
        defaultCenter={initialView.center}
        defaultZoom={initialView.zoom}
        gestureHandling="greedy"
        disableDefaultUI
        zoomControl
        clickableIcons={false}
        draggableCursor={selectedMovable ? 'crosshair' : undefined}
        onCameraChanged={(e) => saveMapView({ center: e.detail.center, zoom: e.detail.zoom })}
        onClick={(e) => {
          const latLng = e.detail.latLng;
          if (!latLng || !selected || !selectedMovable) return;
          onMove(selected.tabId, latLng);
        }}
        className="h-full w-full"
      >
        {tabs.map((tab) =>
          tab.location ? (
            <ActorMarker
              key={tab.tabId}
              tab={{ ...tab, location: tab.location }}
              selected={tab.tabId === selected?.tabId}
              stale={isStale(tab)}
              onSelect={() => onSelect(tab.tabId)}
              onMove={(lat, lng) => onMove(tab.tabId, { lat, lng })}
            />
          ) : null,
        )}
        <TripOverlay tabs={tabs} />
        {found && (
          <FoundPlaceMarker
            found={found}
            movableName={selected && selectedMovable ? actorLabel(selected) : null}
            onMoveHere={(point) => {
              if (!selected) return;
              onMove(selected.tabId, point);
              setFound(null); // the tab's own marker now marks the spot
            }}
          />
        )}
        <FocusController focus={focus} />
      </Map>

      <PlaceSearch onFound={setFound} />

      <div className="pointer-events-none absolute inset-x-0 bottom-6 flex justify-center px-4">
        <div className="pointer-events-auto flex items-center gap-2 rounded-pill bg-neutral-900/90 px-4 py-2 text-[13px] font-semibold text-white shadow-lg">
          <MousePointerClick size={16} />
          {!selected && 'Select a tab, then click the map to place it. Markers can be dragged.'}
          {selected && selectedMovable && (
            <>
              Click the map to move <span className="text-amber-300">{actorLabel(selected)}</span>
              <button
                type="button"
                onClick={() => onSelect(null)}
                className="ml-1 rounded-pill bg-white/15 px-2 py-0.5 text-[12px] hover:bg-white/25"
              >
                Done · Esc
              </button>
            </>
          )}
          {selected && !selectedMovable && (
            <>
              {actorLabel(selected)}{' '}
              {isStale(selected) ? 'is not responding' : 'uses browser GPS — switch it to Simulated in its dev panel'}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
