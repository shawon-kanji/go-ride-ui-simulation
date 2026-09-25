import { Car, ChevronLeft, ChevronRight, Clock, Settings, ShieldCheck, TriangleAlert, User, Wallet } from 'lucide-react';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router';

import { logout } from '../../auth/api';
import { Badge } from '../../../shared/ui/Badge';
import { Button } from '../../../shared/ui/Button';
import { SectionCard } from '../../../shared/ui/SectionCard';
import { useDriverProfileQuery, useKycStatusQuery, useSetOnlineMutation, useVehiclesQuery } from '../api/queries';
import { IDENTITY_DOCUMENT_TYPES, VEHICLE_DOCUMENT_TYPES } from '../kyc/schemas';
import { describeVerificationBlockers, summariseTrack } from '../kyc/verification-summary';
import { deriveOnlineGate } from '../presence/gating';

// D03 Menu — web port of go-ride-driver-app's (app)/menu.tsx. Verification, vehicles
// and profile screens arrive in Phase 6; until then those rows show their status but
// don't navigate, and the "Your work" rows are greyed as in the app.

interface MenuRowProps {
  icon: ReactNode;
  title: string;
  subtitle?: string;
  badge?: { label: string; tone: 'danger' | 'success' };
  onPress?: () => void;
  /** Greyed and inert (the app's "coming soon" treatment). */
  inert?: boolean;
}

function MenuRow({ icon, title, subtitle, badge, onPress, inert = false }: MenuRowProps) {
  const content = (
    <>
      <span className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-control bg-neutral-100">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-bold text-neutral-900">{title}</span>
        {subtitle ? <span className="mt-0.5 block text-[13px] text-neutral-500">{subtitle}</span> : null}
      </span>
      {badge ? <Badge label={badge.label} variant={badge.tone === 'danger' ? 'blocked' : 'active'} /> : null}
      {onPress && <ChevronRight size={20} strokeWidth={2} className="shrink-0 text-neutral-400" />}
    </>
  );
  const classes = `flex min-h-[56px] w-full items-center gap-[10px] border-t border-neutral-200 px-4 py-3 text-left ${inert ? 'opacity-45' : ''}`;

  return onPress ? (
    <button type="button" onClick={onPress} className={`${classes} active:bg-neutral-50`}>
      {content}
    </button>
  ) : (
    <div className={classes}>{content}</div>
  );
}

export function MenuScreen() {
  const navigate = useNavigate();
  const { data: profile } = useDriverProfileQuery();
  const { data: vehicleData } = useVehiclesQuery();
  const { data: kyc } = useKycStatusQuery();
  const setOnline = useSetOnlineMutation();

  const driver = profile?.driver;
  const vehicles = vehicleData?.vehicles;
  const gate = deriveOnlineGate({ vehicles, kyc });

  const identity = summariseTrack(IDENTITY_DOCUMENT_TYPES, kyc?.documents ?? [], undefined);
  const vehicleTrack = gate.activeVehicle
    ? summariseTrack(VEHICLE_DOCUMENT_TYPES, kyc?.documents ?? [], gate.activeVehicle.id)
    : null;
  const blockerSentence = describeVerificationBlockers(identity, vehicleTrack);

  const initials = driver ? `${driver.first_name.charAt(0)}${driver.last_name.charAt(0)}`.toUpperCase() : '';
  const fullName = driver ? `${driver.first_name} ${driver.last_name}`.trim() : 'Driver';
  const statusLine = gate.status === 'ready' ? 'Account active · ready to drive' : 'Account active · not yet cleared to drive';

  const handleLogout = async () => {
    // Going offline first stops dispatch from offering this driver trips it can't see.
    if (driver?.is_online) await setOnline.mutateAsync(false).catch(() => undefined);
    logout('driver');
  };

  return (
    <div className="flex flex-1 flex-col overflow-hidden bg-neutral-50">
      <div className="bg-primary-500 px-5 pt-[18px] pb-5 text-white">
        <button
          type="button"
          onClick={() => navigate('/driver')}
          aria-label="Back"
          className="-ml-2 mb-2 flex h-11 w-11 items-center justify-center"
        >
          <ChevronLeft size={24} strokeWidth={2} />
        </button>
        <div className="flex items-center gap-[10px]">
          <span className="flex h-[52px] w-[52px] items-center justify-center rounded-pill bg-white/20 text-[18px] font-extrabold">
            {initials}
          </span>
          <div>
            <p className="text-[19px] font-extrabold">{fullName}</p>
            <p className="mt-0.5 text-[13px] text-white/[0.82]">{statusLine}</p>
          </div>
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-5 pt-4 pb-10">
        {blockerSentence !== null && (
          <div className="flex items-start gap-3 rounded-control bg-warning-50 px-3 py-3 text-warning-700">
            <TriangleAlert size={20} strokeWidth={2} className="shrink-0" />
            <p className="flex-1 text-[14px] font-semibold">{blockerSentence}</p>
          </div>
        )}

        <SectionCard eyebrow="Get ready to drive">
          <MenuRow
            icon={<ShieldCheck size={20} strokeWidth={2} className="text-primary-600" />}
            title="Verification & documents"
            subtitle={`Identity ${identity.approvedCount} of 5${identity.rejectedCount > 0 ? ` · ${identity.rejectedCount} rejected` : ''}`}
            badge={gate.canGoOnline ? undefined : { label: 'Action needed', tone: 'danger' }}
          />
          <MenuRow
            icon={<Car size={20} strokeWidth={2} className="text-primary-600" />}
            title="My vehicles"
            subtitle={`${vehicles?.length ?? 0} registered${gate.activeVehicle ? ` · ${gate.activeVehicle.plate_number} active` : ' · none active'}`}
            badge={gate.activeVehicle ? { label: 'Active', tone: 'success' } : undefined}
          />
          <MenuRow
            icon={<User size={20} strokeWidth={2} className="text-primary-600" />}
            title="Profile"
            subtitle="Name, email, password"
          />
        </SectionCard>

        <SectionCard eyebrow="Your work">
          <MenuRow icon={<Wallet size={20} strokeWidth={2} className="text-neutral-400" />} title="Earnings" inert />
          <MenuRow icon={<Clock size={20} strokeWidth={2} className="text-neutral-400" />} title="Trip history" inert />
          <MenuRow icon={<Settings size={20} strokeWidth={2} className="text-neutral-400" />} title="Settings" inert />
        </SectionCard>

        <Button
          label="Log out"
          variant="destructive-outline"
          shape="pill"
          size="large"
          loading={setOnline.isPending}
          onClick={() => void handleLogout()}
        />
      </div>
    </div>
  );
}
