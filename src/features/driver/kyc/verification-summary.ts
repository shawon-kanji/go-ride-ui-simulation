import type { DocumentResponse, DocumentType } from '../api/types';

export type DocumentRowState = 'approved' | 'in_review' | 'rejected' | 'missing';

export interface TrackSummary {
  uploadedCount: number;
  approvedCount: number;
  rejectedCount: number;
  missingCount: number;
  total: number;
}

/** Maps a document (or its absence) onto the four row treatments D04 specifies.
 *  'uploaded' is the backend's word for "waiting on a human reviewer" — the UI
 *  calls that "In review", which is why the vocabularies differ here. */
export function documentRowState(document: DocumentResponse | undefined): DocumentRowState {
  if (!document) return 'missing';
  if (document.status === 'approved') return 'approved';
  if (document.status === 'rejected') return 'rejected';
  return 'in_review';
}

/** Counts DISTINCT required types, never raw rows — a driver who re-uploads the
 *  same type twice must not show 6 of 5. Identical rule to plan 02-04's
 *  deriveOnlineGate; keep the two in lockstep.
 *  `vehicleId === undefined` means the identity track, whose documents carry no
 *  vehicle_id at all. */
export function summariseTrack(
  requiredTypes: readonly DocumentType[],
  documents: DocumentResponse[],
  vehicleId: string | undefined,
): TrackSummary {
  let approvedCount = 0;
  let rejectedCount = 0;
  let missingCount = 0;

  for (const type of requiredTypes) {
    const match = documents.find((d) => d.document_type === type && d.vehicle_id === vehicleId);
    const state = documentRowState(match);
    if (state === 'approved') approvedCount += 1;
    else if (state === 'rejected') rejectedCount += 1;
    else if (state === 'missing') missingCount += 1;
    // 'in_review' contributes only to uploadedCount below.
  }

  const total = requiredTypes.length;
  const uploadedCount = total - missingCount;

  return { uploadedCount, approvedCount, rejectedCount, missingCount, total };
}

function plural(count: number, word: string): string {
  return count === 1 ? word : `${word}s`;
}

function joinWithAnd(parts: string[]): string {
  if (parts.length === 1) return parts[0];
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

/** The one-sentence D04/D03/D06 warning. Order matters: identity first, matching
 *  the backend's own 403 precedence (KYC_NOT_APPROVED before VEHICLE_NOT_VERIFIED). */
export function describeVerificationBlockers(
  identity: TrackSummary,
  vehicle: TrackSummary | null,
): string | null {
  const parts: string[] = [];
  if (identity.rejectedCount > 0) {
    parts.push(`${identity.rejectedCount} identity ${plural(identity.rejectedCount, 'document')} rejected`);
  }
  if (identity.missingCount > 0) {
    parts.push(`${identity.missingCount} identity ${plural(identity.missingCount, 'document')} missing`);
  }
  if (vehicle === null) {
    parts.push('no vehicle registered yet');
  } else {
    if (vehicle.rejectedCount > 0) {
      parts.push(`${vehicle.rejectedCount} vehicle ${plural(vehicle.rejectedCount, 'document')} rejected`);
    }
    if (vehicle.missingCount > 0) {
      parts.push(`${vehicle.missingCount} vehicle ${plural(vehicle.missingCount, 'document')} missing`);
    }
  }
  if (parts.length === 0) return null;
  return `Can't go online: ${joinWithAnd(parts)}.`;
}
