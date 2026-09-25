import { describeVerificationBlockers, documentRowState, summariseTrack } from './verification-summary';
import { IDENTITY_DOCUMENT_TYPES, VEHICLE_DOCUMENT_TYPES } from './schemas';
import { makeDocument } from '../../../test/kyc-fixtures';

describe('summariseTrack', () => {
  it('Test 1: returns all-missing for an empty identity track', () => {
    expect(summariseTrack(IDENTITY_DOCUMENT_TYPES, [], undefined)).toEqual({
      uploadedCount: 0,
      approvedCount: 0,
      rejectedCount: 0,
      missingCount: 5,
      total: 5,
    });
  });

  it('Test 2: counts 4 approved + 1 rejected identity documents', () => {
    const documents = [
      makeDocument('selfie', { status: 'approved' }),
      makeDocument('govt_id_front', { status: 'approved' }),
      makeDocument('govt_id_back', { status: 'approved' }),
      makeDocument('driving_license_front', { status: 'approved' }),
      makeDocument('driving_license_back', { status: 'rejected' }),
    ];
    const result = summariseTrack(IDENTITY_DOCUMENT_TYPES, documents, undefined);
    expect(result.uploadedCount).toBe(5);
    expect(result.approvedCount).toBe(4);
    expect(result.rejectedCount).toBe(1);
    expect(result.missingCount).toBe(0);
  });

  it('Test 3: two documents of the same required type count once', () => {
    const documents = [
      makeDocument('selfie', { id: 'doc-selfie-old', status: 'rejected' }),
      makeDocument('selfie', { id: 'doc-selfie-new', status: 'approved' }),
    ];
    const result = summariseTrack(IDENTITY_DOCUMENT_TYPES, documents, undefined);
    expect(result.approvedCount).toBeLessThanOrEqual(result.total);
    expect(result.approvedCount + result.rejectedCount + result.missingCount).toBe(result.total);
  });

  it('Test 4: vehicle-track counting is scoped by vehicle_id', () => {
    const vehicleBDocuments = VEHICLE_DOCUMENT_TYPES.map((type) =>
      makeDocument(type, { vehicle_id: 'vehicle-b', status: 'approved' }),
    );
    const result = summariseTrack(VEHICLE_DOCUMENT_TYPES, vehicleBDocuments, 'vehicle-a');
    expect(result.approvedCount).toBe(0);
    expect(result.missingCount).toBe(5);
  });

  it('Test 5: identity documents are never counted into a vehicle track, and vice versa', () => {
    const identityDocs = IDENTITY_DOCUMENT_TYPES.map((type) => makeDocument(type, { status: 'approved' }));
    const vehicleDocs = VEHICLE_DOCUMENT_TYPES.map((type) =>
      makeDocument(type, { vehicle_id: 'vehicle-a', status: 'approved' }),
    );
    const allDocuments = [...identityDocs, ...vehicleDocs];

    const identityResult = summariseTrack(IDENTITY_DOCUMENT_TYPES, allDocuments, undefined);
    expect(identityResult.approvedCount).toBe(5);

    const vehicleResult = summariseTrack(VEHICLE_DOCUMENT_TYPES, allDocuments, 'vehicle-a');
    expect(vehicleResult.approvedCount).toBe(5);
  });
});

describe('documentRowState', () => {
  it('Test 6: maps document status (or absence) to the four row states', () => {
    expect(documentRowState(undefined)).toBe('missing');
    expect(documentRowState(makeDocument('selfie', { status: 'uploaded' }))).toBe('in_review');
    expect(documentRowState(makeDocument('selfie', { status: 'approved' }))).toBe('approved');
    expect(documentRowState(makeDocument('selfie', { status: 'rejected' }))).toBe('rejected');
  });
});

describe('describeVerificationBlockers', () => {
  it('Test 7: returns null when both tracks are fully approved', () => {
    const identity = summariseTrack(
      IDENTITY_DOCUMENT_TYPES,
      IDENTITY_DOCUMENT_TYPES.map((type) => makeDocument(type, { status: 'approved' })),
      undefined,
    );
    const vehicle = summariseTrack(
      VEHICLE_DOCUMENT_TYPES,
      VEHICLE_DOCUMENT_TYPES.map((type) => makeDocument(type, { vehicle_id: 'vehicle-a', status: 'approved' })),
      'vehicle-a',
    );
    expect(describeVerificationBlockers(identity, vehicle)).toBeNull();
  });

  it('Test 8: names both an identity rejection and missing vehicle documents', () => {
    const identityDocuments = [
      makeDocument('selfie', { status: 'approved' }),
      makeDocument('govt_id_front', { status: 'approved' }),
      makeDocument('govt_id_back', { status: 'approved' }),
      makeDocument('driving_license_front', { status: 'approved' }),
      makeDocument('driving_license_back', { status: 'rejected' }),
    ];
    const vehicleDocuments = [
      makeDocument('vehicle_registration', { vehicle_id: 'vehicle-a', status: 'approved' }),
      makeDocument('vehicle_photo_front', { vehicle_id: 'vehicle-a', status: 'approved' }),
      makeDocument('vehicle_photo_back', { vehicle_id: 'vehicle-a', status: 'approved' }),
    ];
    const identity = summariseTrack(IDENTITY_DOCUMENT_TYPES, identityDocuments, undefined);
    const vehicle = summariseTrack(VEHICLE_DOCUMENT_TYPES, vehicleDocuments, 'vehicle-a');

    const sentence = describeVerificationBlockers(identity, vehicle);
    expect(sentence).toMatch(/^Can't go online:/);
    expect(sentence).toContain('1 identity document rejected');
    expect(sentence).toContain('2 vehicle documents missing');
  });

  it('Test 9: names the missing vehicle instead of throwing when vehicle is null', () => {
    const identity = summariseTrack(
      IDENTITY_DOCUMENT_TYPES,
      IDENTITY_DOCUMENT_TYPES.map((type) => makeDocument(type, { status: 'approved' })),
      undefined,
    );
    const sentence = describeVerificationBlockers(identity, null);
    expect(sentence).toMatch(/^Can't go online:/);
    expect(sentence).toContain('no vehicle registered yet');
  });

  it('Test 10: singular/plural for missing vehicle documents is correct', () => {
    const identity = summariseTrack(
      IDENTITY_DOCUMENT_TYPES,
      IDENTITY_DOCUMENT_TYPES.map((type) => makeDocument(type, { status: 'approved' })),
      undefined,
    );

    const oneMissingVehicle = summariseTrack(
      VEHICLE_DOCUMENT_TYPES,
      VEHICLE_DOCUMENT_TYPES.slice(1).map((type) => makeDocument(type, { vehicle_id: 'vehicle-a', status: 'approved' })),
      'vehicle-a',
    );
    expect(describeVerificationBlockers(identity, oneMissingVehicle)).toContain('1 vehicle document missing');

    const twoMissingVehicle = summariseTrack(
      VEHICLE_DOCUMENT_TYPES,
      VEHICLE_DOCUMENT_TYPES.slice(2).map((type) => makeDocument(type, { vehicle_id: 'vehicle-a', status: 'approved' })),
      'vehicle-a',
    );
    expect(describeVerificationBlockers(identity, twoMissingVehicle)).toContain('2 vehicle documents missing');
  });
});
