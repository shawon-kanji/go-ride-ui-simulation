import type { DocumentType, IdentityDocumentType, VehicleDocumentType } from '../api/types';

// Hand-copied from go-ride-backend/domain/kyc/entity.go's
// RequiredIdentityDocumentTypes / RequiredVehicleDocumentTypes — the order here
// is the display order on the Verify hub. Keep in sync with that file.
export const IDENTITY_DOCUMENT_TYPES = [
  'selfie',
  'govt_id_front',
  'govt_id_back',
  'driving_license_front',
  'driving_license_back',
] as const satisfies readonly IdentityDocumentType[];

export const VEHICLE_DOCUMENT_TYPES = [
  'vehicle_registration',
  'vehicle_photo_front',
  'vehicle_photo_back',
  'vehicle_photo_side',
  'vehicle_number_plate',
] as const satisfies readonly VehicleDocumentType[];

export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  selfie: 'Selfie',
  govt_id_front: 'Government ID (front)',
  govt_id_back: 'Government ID (back)',
  driving_license_front: 'Driving license (front)',
  driving_license_back: 'Driving license (back)',
  vehicle_registration: 'Vehicle registration',
  vehicle_photo_front: 'Vehicle photo (front)',
  vehicle_photo_back: 'Vehicle photo (back)',
  vehicle_photo_side: 'Vehicle photo (side)',
  vehicle_number_plate: 'Number plate',
};

/** Single source of truth for "does this document type need a vehicle_id?" —
 *  mirrors go-ride-backend/domain/kyc.IsVehicleDocumentType. Never infer this
 *  from a 'vehicle_' string prefix: the backend's list is the contract. */
export function isVehicleDocumentType(value: DocumentType): value is VehicleDocumentType {
  return (VEHICLE_DOCUMENT_TYPES as readonly string[]).includes(value);
}

/** Narrows an untrusted string (e.g. an route param) to DocumentType. */
export function isDocumentType(value: string): value is DocumentType {
  return (
    (IDENTITY_DOCUMENT_TYPES as readonly string[]).includes(value) ||
    (VEHICLE_DOCUMENT_TYPES as readonly string[]).includes(value)
  );
}
