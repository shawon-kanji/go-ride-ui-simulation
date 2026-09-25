import { ChevronRight, Pause, TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';

import { SessionExpiryBanner } from '../../auth/SessionExpiryBanner';
import { useLocationStore } from '../../../shared/location/location-store';
import { PhoneMap } from '../../../shared/map/PhoneMap';
import { Badge } from '../../../shared/ui/Badge';
import { Button } from '../../../shared/ui/Button';
import { Card } from '../../../shared/ui/Card';
import { useDriverProfileQuery, useKycStatusQuery, useSetOnlineMutation, useSetPausedMutation, useVehiclesQuery } from '../api/queries';
import { ConfirmOnlineSheet } from '../components/ConfirmOnlineSheet';
import { KycBlockedBanner } from '../components/KycBlockedBanner';
import { ProfileChip } from '../components/ProfileChip';
import { StatCards } from '../components/StatCards';
import { countOpen, useOfferStore } from '../offers/offer-store';
import { deriveOnlineGate, gateToKycBlockReason } from '../presence/gating';
import { useBroadcastStatus } from '../presence/location-broadcaster';

// D06 Go online — web port of go-ride-driver-app's (app)/index.tsx. The design covers
// the offline state; the online block (status, pause, offers waiting, go offline) is
// this app's addition.

const KYC_STATUS_BADGE = {
  not_started: { label: 'Not started', variant: 'inactive' },
  in_review: { label: 'In review', variant: 'pending' },
  approved: { label: 'Approved', variant: 'active' },
  rejected: { label: 'Rejected', variant: 'blocked' },
} as const;

function OnlineBlock({ isPaused }: { isPaused: boolean }) {
  const navigate = useNavigate();
  const setOnline = useSetOnlineMutation();
  const setPaused = useSetPausedMutation();
  const openOffers = useOfferStore((s) => countOpen(Object.values(s.offers)));
  const pings = useBroadcastStatus((s) => s.sentCount);
  const position = useLocationStore((s) => s.position);

  return (
    <div className="mt-4 flex flex-col gap-3">
      <div
        className={`flex items-center gap-3 rounded-control px-3 py-3 ${isPaused ? 'bg-warning-50 text-warning-700' : 'bg-success-50 text-success-700'}`}
      >
        {isPaused ? (
          <Pause size={18} strokeWidth={2.4} className="shrink-0" />
        ) : (
          <span className="relative flex h-3 w-3 shrink-0">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success-500 opacity-60" />
            <span className="relative inline-flex h-3 w-3 rounded-full bg-success-500" />
          </span>
        )}
        <div className="flex-1">
          <p className="text-[15px] font-bold">{isPaused ? 'Paused' : "You're online"}</p>
          <p className="text-[13px] opacity-90">
            {isPaused
              ? "You won't get new offers until you resume."
              : position
                ? `Waiting for trips near you · ${pings} location ${pings === 1 ? 'ping' : 'pings'} sent`
                : 'No location yet — place this tab in the simulator.'}
          </p>
        </div>
      </div>

      {!position && (
        <div className="flex items-start gap-3 rounded-control bg-warning-50 px-3 py-3 text-warning-700">
          <TriangleAlert size={18} className="mt-px shrink-0" />
          <p className="text-[13px] font-semibold">Dispatch can't find you without a location.</p>
        </div>
      )}

      {openOffers > 0 && (
        <button
          type="button"
          onClick={() => navigate('/driver/offers')}
          className="flex items-center justify-between rounded-control bg-neutral-900 px-4 py-3 text-left text-white"
        >
          <span className="text-[15px] font-bold">
            {openOffers} {openOffers === 1 ? 'offer' : 'offers'} waiting
          </span>
          <ChevronRight size={20} />
        </button>
      )}

      <div className="flex gap-3">
        <div className="w-[46%]">
          <Button
            label={isPaused ? 'Resume' : 'Pause'}
            variant={isPaused ? 'success' : 'ghost'}
            shape="pill"
            size="large"
            loading={setPaused.isPending}
            onClick={() => setPaused.mutate(!isPaused)}
          />
        </div>
        <div className="flex-1">
          <Button
            label="Go offline"
            variant="destructive-outline"
            shape="pill"
            size="large"
            loading={setOnline.isPending}
            onClick={() => setOnline.mutate(false)}
          />
        </div>
      </div>
    </div>
  );
}

export function HomeScreen() {
  const navigate = useNavigate();
  const { data: profile } = useDriverProfileQuery();
  const { data: vehicleData } = useVehiclesQuery();
  const { data: kyc } = useKycStatusQuery();
  const position = useLocationStore((s) => s.position);
  const [sheetOpen, setSheetOpen] = useState(false);

  const driver = profile?.driver;
  const isOnline = driver?.is_online === true;
  const isPaused = driver?.is_paused === true;
  const gate = deriveOnlineGate({ vehicles: vehicleData?.vehicles, kyc });
  const blockReason = gateToKycBlockReason(gate.status);
  const needsVehicle = gate.status === 'no_vehicle' || gate.status === 'no_active_vehicle';

  return (
    <div className="relative flex-1 overflow-hidden bg-neutral-50">
      <PhoneMap position={position} self="driver" bottomInset={isOnline ? 330 : 380} />

      <div className="absolute top-5 right-5 left-5 flex">
        <ProfileChip
          firstName={driver?.first_name ?? ''}
          lastName={driver?.last_name ?? ''}
          plate={gate.activeVehicle?.plate_number ?? null}
          status={isOnline ? (isPaused ? 'paused' : 'online') : 'offline'}
          hasAlert={!gate.canGoOnline}
          onPress={() => navigate('/driver/menu')}
        />
      </div>

      <div className="absolute inset-x-0 bottom-0 max-h-[70%] overflow-y-auto rounded-t-[24px] bg-white px-5 pt-4 pb-5 shadow-sheet">
        <SessionExpiryBanner role="driver" />
        <StatCards />

        {!isOnline && (
          <Card className="mt-4">
            <div className="flex items-center justify-between">
              <p className="text-[15px] font-bold text-neutral-900">Verification</p>
              {kyc && <Badge label={KYC_STATUS_BADGE[kyc.kyc_status].label} variant={KYC_STATUS_BADGE[kyc.kyc_status].variant} />}
            </div>
            <p className="mt-1 text-[13px] text-neutral-600">
              {kyc?.kyc_status === 'approved'
                ? 'Your identity documents are approved.'
                : 'Upload your identity and vehicle documents to get approved.'}
            </p>
          </Card>
        )}

        {isOnline ? (
          <OnlineBlock isPaused={isPaused} />
        ) : (
          <>
            {blockReason && (
              <div className="mt-4">
                <KycBlockedBanner reason={blockReason} />
              </div>
            )}

            {needsVehicle && (
              <div className="mt-4 flex items-start gap-3 rounded-control bg-warning-50 px-3 py-3 text-warning-700">
                <TriangleAlert size={18} strokeWidth={2} className="mt-px shrink-0" />
                <div className="flex-1">
                  <p className="text-[14px] font-bold">No active vehicle</p>
                  <p className="mt-0.5 text-[13px] font-semibold opacity-90">Activate a vehicle before you can go online.</p>
                </div>
              </div>
            )}

            <div className="mt-3">
              <Button
                label="Go online"
                variant={gate.canGoOnline ? 'success' : 'muted'}
                shape="pill"
                size="large"
                disabled={!gate.canGoOnline}
                onClick={() => setSheetOpen(true)}
              />
            </div>

            <p className="mt-3 text-center text-[12px] text-neutral-500">
              Once you&apos;re cleared, Go online asks you to confirm the vehicle first.
            </p>
          </>
        )}
      </div>

      {gate.activeVehicle && (
        <ConfirmOnlineSheet
          open={sheetOpen}
          vehicle={gate.activeVehicle}
          approvedDocumentCount={gate.approvedVehicleDocumentCount}
          onDismiss={() => setSheetOpen(false)}
          onWentOnline={() => setSheetOpen(false)}
        />
      )}
    </div>
  );
}
