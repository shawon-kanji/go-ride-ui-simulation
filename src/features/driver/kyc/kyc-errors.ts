import { ApiError } from '../../../shared/api/http-client';

/** Which KYC track is blocking the driver: their own identity documents,
 *  or the target vehicle's documents. Mirrors go-ride-backend's two 403 codes. */
export type KycBlockReason = 'identity' | 'vehicle';

/** Maps an unknown thrown value to a KYC block reason, or null if this error
 *  is not a KYC gate at all. Never widen this to "any 403" — DOCUMENT_FORBIDDEN
 *  is also a 403 but means the driver doesn't own the vehicle, which is a
 *  different problem with a different fix. */
export function kycBlockReason(error: unknown): KycBlockReason | null {
  if (!(error instanceof ApiError)) return null;
  if (error.code === 'KYC_NOT_APPROVED') return 'identity';
  if (error.code === 'VEHICLE_NOT_VERIFIED') return 'vehicle';
  return null;
}
