import { Car, Check, MapPin, Navigation } from 'lucide-react';
import { useState } from 'react';

import { useLocationStore } from '../../../shared/location/location-store';
import { Button } from '../../../shared/ui/Button';
import { ModalSheet } from '../../../shared/ui/ModalSheet';
import { useSetOnlineMutation } from '../api/queries';
import type { Vehicle } from '../api/types';
import { kycBlockReason, type KycBlockReason } from '../kyc/kyc-errors';
import { VEHICLE_DOCUMENT_TYPES } from '../kyc/schemas';
import { KycBlockedBanner } from './KycBlockedBanner';

// D07 — web port of go-ride-driver-app's ConfirmOnlineSheet. Going online always
// passes through here. Where the app asks for OS location permission on this tap,
// the web version checks the tab has a location (placed in the simulator, or browser
// GPS): without one, dispatch can never match this driver.

const GENERIC_ERROR = "Couldn't go online. Check your connection and try again.";

interface ConfirmOnlineSheetProps {
  open: boolean;
  vehicle: Vehicle;
  approvedDocumentCount: number;
  onDismiss: () => void;
  onWentOnline: () => void;
}

export function ConfirmOnlineSheet({ open, vehicle, approvedDocumentCount, onDismiss, onWentOnline }: ConfirmOnlineSheetProps) {
  const mutation = useSetOnlineMutation();
  const position = useLocationStore((s) => s.position);
  const source = useLocationStore((s) => s.source);
  const setSource = useLocationStore((s) => s.setSource);
  const [blockReason, setBlockReason] = useState<KycBlockReason | null>(null);
  const [genericError, setGenericError] = useState<string | null>(null);
  const [needsLocation, setNeedsLocation] = useState(false);

  const allDocumentsApproved = approvedDocumentCount === VEHICLE_DOCUMENT_TYPES.length;

  const handleGoOnline = () => {
    if (mutation.isPending) return;
    setBlockReason(null);
    setGenericError(null);
    if (!useLocationStore.getState().position) {
      setNeedsLocation(true);
      return;
    }
    setNeedsLocation(false);
    mutation.mutate(true, {
      onSuccess: onWentOnline,
      onError: (error) => {
        const reason = kycBlockReason(error);
        if (reason) setBlockReason(reason);
        else setGenericError(GENERIC_ERROR);
      },
    });
  };

  return (
    <ModalSheet open={open} onDismiss={onDismiss} labelledBy="confirm-online-title">
      <h2 id="confirm-online-title" className="text-[22px] font-extrabold tracking-[-0.01em] text-neutral-900">
        Go online with this vehicle?
      </h2>
      <p className="mt-2 text-[15px] text-neutral-600">
        Riders will be matched to the vehicle you confirm here, and its plate is shown to them at pickup.
      </p>

      <div className="mt-4 overflow-hidden rounded-card border-2 border-primary-500 bg-primary-50">
        <div className="flex items-center px-4 py-3">
          <Car size={28} strokeWidth={2} className="shrink-0 text-primary-600" />
          <div className="ml-3 min-w-0 flex-1">
            <p className="truncate text-[18px] font-extrabold text-neutral-900">{vehicle.model_name}</p>
            <p className="text-[14px] text-neutral-600">
              {vehicle.color} · {vehicle.seat_count} seats · {vehicle.category}
            </p>
          </div>
          <div className="text-right">
            <p className="text-[12px] font-bold uppercase tracking-[0.08em] text-neutral-500">Plate</p>
            <p className="text-[17px] font-extrabold text-neutral-900">{vehicle.plate_number}</p>
          </div>
        </div>
        {allDocumentsApproved && (
          <div className="flex items-center gap-2 bg-success-50 px-4 py-2 text-success-700">
            <Check size={16} strokeWidth={2.4} />
            <p className="text-[13px] font-bold">All {VEHICLE_DOCUMENT_TYPES.length} documents approved</p>
          </div>
        )}
      </div>

      <div className="mt-4 flex items-start gap-2 rounded-control bg-neutral-50 px-3 py-3 text-neutral-600">
        <MapPin size={18} strokeWidth={2} className="mt-px shrink-0" />
        <p className="flex-1 text-[13px]">
          Your location is shared while you&apos;re online, and stops the moment you go offline.
        </p>
      </div>

      {needsLocation && !position && (
        <div className="mt-4 rounded-control border border-warning-500 bg-warning-50 px-3 py-3">
          <p className="text-[15px] font-bold text-warning-700">Set your location first</p>
          <p className="mt-1 text-[13px] text-neutral-700">
            Riders can only be matched to you once this tab has a location. Place it in the simulator (select this
            tab, then click the map), or use this browser&apos;s GPS.
          </p>
          {source === 'simulated' && (
            <button
              type="button"
              onClick={() => setSource('browser')}
              className="mt-2 inline-flex items-center gap-1.5 text-[13px] font-bold text-primary-600"
            >
              <Navigation size={14} /> Use browser GPS
            </button>
          )}
        </div>
      )}

      {blockReason && (
        <div className="mt-4">
          <KycBlockedBanner reason={blockReason} />
        </div>
      )}

      {!blockReason && genericError && <p className="mt-4 text-[13px] text-warning-700">{genericError}</p>}

      <div className="mt-5 flex gap-3">
        <div className="w-[46%]">
          <Button label="Switch vehicle" variant="ghost" shape="pill" size="large" onClick={onDismiss} />
        </div>
        <div className="flex-1">
          <Button
            label="Go online"
            variant="success"
            shape="pill"
            size="large"
            loading={mutation.isPending}
            onClick={handleGoOnline}
          />
        </div>
      </div>
    </ModalSheet>
  );
}
