import type { KycStatusResponse, Vehicle } from '../api/types';
import type { KycBlockReason } from '../kyc/kyc-errors';
import { VEHICLE_DOCUMENT_TYPES } from '../kyc/schemas';

export type OnlineGateStatus =
  | 'ready'
  | 'no_vehicle'
  | 'no_active_vehicle'
  | 'identity_blocked'
  | 'vehicle_blocked';

export interface OnlineGate {
  status: OnlineGateStatus;
  canGoOnline: boolean; // true only when status === 'ready'
  activeVehicle: Vehicle | null;
  approvedVehicleDocumentCount: number; // 0-5, for the active vehicle
}

/** The single source of truth for "may this driver go online, and if not, why".
 *  Consumed directly by D06 (home screen) and D07 (online toggle) so the decision
 *  is derived once instead of twice and cannot drift between the two screens.
 *
 *  Identity is evaluated BEFORE vehicle documents so the client's block reason
 *  matches the backend's own 403 precedence — PATCH /driver/online returns
 *  KYC_NOT_APPROVED before it ever looks at VEHICLE_NOT_VERIFIED. */
export function deriveOnlineGate(input: {
  vehicles: Vehicle[] | undefined;
  kyc: KycStatusResponse | undefined;
}): OnlineGate {
  const { vehicles, kyc } = input;

  if (!vehicles || vehicles.length === 0) {
    return { status: 'no_vehicle', canGoOnline: false, activeVehicle: null, approvedVehicleDocumentCount: 0 };
  }

  const activeVehicle = vehicles.find((v) => v.is_active) ?? null;

  if (activeVehicle === null) {
    return {
      status: 'no_active_vehicle',
      canGoOnline: false,
      activeVehicle: null,
      approvedVehicleDocumentCount: 0,
    };
  }

  // Count distinct required vehicle document types approved for THIS active vehicle,
  // not raw document rows — a duplicate upload of the same type must not inflate the
  // count past 5, and documents belonging to a different (inactive) vehicle must not
  // count at all.
  const approvedVehicleDocumentCount = VEHICLE_DOCUMENT_TYPES.filter((documentType) =>
    (kyc?.documents ?? []).some(
      (doc) =>
        doc.document_type === documentType &&
        doc.vehicle_id === activeVehicle.id &&
        doc.status === 'approved',
    ),
  ).length;

  if (kyc === undefined || kyc.kyc_status !== 'approved') {
    return {
      status: 'identity_blocked',
      canGoOnline: false,
      activeVehicle,
      approvedVehicleDocumentCount,
    };
  }

  if (approvedVehicleDocumentCount < VEHICLE_DOCUMENT_TYPES.length) {
    return {
      status: 'vehicle_blocked',
      canGoOnline: false,
      activeVehicle,
      approvedVehicleDocumentCount,
    };
  }

  return { status: 'ready', canGoOnline: true, activeVehicle, approvedVehicleDocumentCount };
}

/** Maps a gate status onto the existing Phase 01.1 KycBlockedBanner vocabulary.
 *  Returns null for the two vehicle-presence cases, which are NOT KYC blocks and get
 *  their own "Go to Vehicles" copy (UI-SPEC Copywriting Contract). */
export function gateToKycBlockReason(status: OnlineGateStatus): KycBlockReason | null {
  if (status === 'identity_blocked') return 'identity';
  if (status === 'vehicle_blocked') return 'vehicle';
  return null;
}
