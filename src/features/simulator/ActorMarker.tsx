import { AdvancedMarker } from '@vis.gl/react-google-maps';
import { Car, Navigation, User } from 'lucide-react';

import { actorLabel, type RegisteredTab } from './tab-registry';

// One rider or driver on the simulator map: a round role-coloured icon with a name tag.
// Simulated tabs can be dragged; browser-GPS tabs are shown but can't be moved.

const ROLE_STYLE = {
  driver: { dot: 'bg-[#4f46e5]', ring: 'ring-[#4f46e5]/30', Icon: Car },
  rider: { dot: 'bg-[#00a04a]', ring: 'ring-[#00a04a]/30', Icon: User },
} as const;

interface ActorMarkerProps {
  tab: RegisteredTab & { location: NonNullable<RegisteredTab['location']> };
  selected: boolean;
  stale: boolean;
  onSelect: () => void;
  onMove: (lat: number, lng: number) => void;
}

export function ActorMarker({ tab, selected, stale, onSelect, onMove }: ActorMarkerProps) {
  const style = ROLE_STYLE[tab.role ?? 'rider'];
  const Icon = tab.locationSource === 'browser' ? Navigation : style.Icon;
  const movable = tab.locationSource === 'simulated' && !stale;
  const dimmed = stale || tab.activity === 'offline';

  return (
    <AdvancedMarker
      position={tab.location}
      draggable={movable}
      zIndex={selected ? 1000 : tab.role === 'rider' ? 500 : 100}
      anchorLeft="-50%"
      anchorTop="-18px"
      title={`${tab.name ?? 'Signed out'} · ${tab.role} · ${tab.tabId.slice(0, 4)}`}
      onClick={onSelect}
      onDragStart={onSelect}
      onDragEnd={(e) => {
        const latLng = e.latLng;
        if (latLng) onMove(latLng.lat(), latLng.lng());
      }}
    >
      <div className={`flex flex-col items-center ${dimmed ? 'opacity-50' : ''}`}>
        <span
          className={`flex h-9 w-9 items-center justify-center rounded-full border-2 border-white text-white shadow-[0_4px_14px_rgba(16,22,20,0.25)] ${style.dot} ${selected ? `scale-110 ring-8 ${style.ring}` : ''}`}
        >
          <Icon size={18} strokeWidth={2.2} />
        </span>
        {/* Colour and font are inline: Google's unlayered map CSS beats Tailwind's layered utilities. */}
        <span
          className={`mt-1 whitespace-nowrap rounded-pill px-2 py-0.5 text-[11px] font-bold shadow-sm ${selected ? 'bg-neutral-900' : 'bg-white'}`}
          style={{ color: selected ? '#ffffff' : '#1f2937', fontFamily: 'var(--font-sans)' }}
        >
          {actorLabel(tab)}
          {tab.activity && tab.activity !== 'offline' ? ` · ${tab.activity}` : ''}
        </span>
      </div>
    </AdvancedMarker>
  );
}
