import type { DocumentResponse, KycStatusResponse, Vehicle } from '../api/types';
import { VEHICLE_DOCUMENT_TYPES } from '../kyc/schemas';
import { deriveOnlineGate, gateToKycBlockReason } from './gating';

const ACTIVE_VEHICLE_ID = 'vehicle-active';
const OTHER_VEHICLE_ID = 'vehicle-other';

function makeVehicle(overrides: Partial<Vehicle> = {}): Vehicle {
  return {
    id: ACTIVE_VEHICLE_ID,
    driver_id: 'driver-1',
    plate_number: 'ABC-123',
    color: 'black',
    model_name: 'Corolla',
    seat_count: 4,
    category: 'normal',
    is_active: true,
    ...overrides,
  };
}

function makeApprovedDocsFor(vehicleId: string): DocumentResponse[] {
  return VEHICLE_DOCUMENT_TYPES.map((documentType) => ({
    id: `doc-${vehicleId}-${documentType}`,
    document_type: documentType,
    vehicle_id: vehicleId,
    status: 'approved',
  }));
}

function makeKyc(overrides: Partial<KycStatusResponse> = {}): KycStatusResponse {
  return { kyc_status: 'approved', documents: [], ...overrides };
}

describe('deriveOnlineGate', () => {
  it('returns no_vehicle when vehicles is an empty array', () => {
    const gate = deriveOnlineGate({ vehicles: [], kyc: makeKyc() });
    expect(gate).toMatchObject({ status: 'no_vehicle', canGoOnline: false, activeVehicle: null });
  });

  it('returns no_active_vehicle when vehicles exist but none is active', () => {
    const gate = deriveOnlineGate({
      vehicles: [makeVehicle({ is_active: false })],
      kyc: makeKyc(),
    });
    expect(gate).toMatchObject({
      status: 'no_active_vehicle',
      canGoOnline: false,
      activeVehicle: null,
    });
  });

  it('returns identity_blocked when an active vehicle exists but kyc_status is not approved', () => {
    const activeVehicle = makeVehicle();
    const gate = deriveOnlineGate({
      vehicles: [activeVehicle],
      kyc: makeKyc({ kyc_status: 'in_review' }),
    });
    expect(gate.status).toBe('identity_blocked');
    expect(gate.canGoOnline).toBe(false);
    expect(gate.activeVehicle).toEqual(activeVehicle);
  });

  it('returns vehicle_blocked with the real approved count when fewer than 5 documents are approved', () => {
    const activeVehicle = makeVehicle();
    const docs = makeApprovedDocsFor(ACTIVE_VEHICLE_ID).slice(0, 3);
    const gate = deriveOnlineGate({
      vehicles: [activeVehicle],
      kyc: makeKyc({ documents: docs }),
    });
    expect(gate.status).toBe('vehicle_blocked');
    expect(gate.approvedVehicleDocumentCount).toBe(3);
  });

  it('returns ready when identity is approved and all 5 documents for the active vehicle are approved', () => {
    const activeVehicle = makeVehicle();
    const docs = makeApprovedDocsFor(ACTIVE_VEHICLE_ID);
    const gate = deriveOnlineGate({
      vehicles: [activeVehicle],
      kyc: makeKyc({ documents: docs }),
    });
    expect(gate.status).toBe('ready');
    expect(gate.canGoOnline).toBe(true);
    expect(gate.approvedVehicleDocumentCount).toBe(5);
  });

  it('does not let 5 approved documents on a DIFFERENT vehicle satisfy the gate', () => {
    const activeVehicle = makeVehicle({ id: ACTIVE_VEHICLE_ID });
    const inactiveVehicle = makeVehicle({ id: OTHER_VEHICLE_ID, is_active: false });
    const docs = makeApprovedDocsFor(OTHER_VEHICLE_ID);
    const gate = deriveOnlineGate({
      vehicles: [activeVehicle, inactiveVehicle],
      kyc: makeKyc({ documents: docs }),
    });
    expect(gate.status).toBe('vehicle_blocked');
    expect(gate.approvedVehicleDocumentCount).toBe(0);
  });

  it('returns no_vehicle without throwing when vehicles or kyc are still loading (undefined)', () => {
    expect(() => deriveOnlineGate({ vehicles: undefined, kyc: undefined })).not.toThrow();
    const gate = deriveOnlineGate({ vehicles: undefined, kyc: undefined });
    expect(gate.status).toBe('no_vehicle');
    expect(gate.canGoOnline).toBe(false);
  });

  it('checks identity before vehicle documents — identity_blocked wins over zero vehicle documents', () => {
    const activeVehicle = makeVehicle();
    const gate = deriveOnlineGate({
      vehicles: [activeVehicle],
      kyc: makeKyc({ kyc_status: 'not_started', documents: [] }),
    });
    expect(gate.status).toBe('identity_blocked');
  });
});

describe('gateToKycBlockReason', () => {
  it('maps identity_blocked to identity', () => {
    expect(gateToKycBlockReason('identity_blocked')).toBe('identity');
  });

  it('maps vehicle_blocked to vehicle', () => {
    expect(gateToKycBlockReason('vehicle_blocked')).toBe('vehicle');
  });

  it('maps ready/no_vehicle/no_active_vehicle to null', () => {
    expect(gateToKycBlockReason('ready')).toBeNull();
    expect(gateToKycBlockReason('no_vehicle')).toBeNull();
    expect(gateToKycBlockReason('no_active_vehicle')).toBeNull();
  });
});
