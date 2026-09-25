import type { DocumentResponse, DocumentType, KycStatusResponse } from '../features/driver/api/types';

// Copied from go-ride-driver-app/src/test-utils/kyc-fixtures.ts.
export function makeDocument(documentType: DocumentType, overrides: Partial<DocumentResponse> = {}): DocumentResponse {
  return {
    id: `doc-${documentType}`,
    document_type: documentType,
    status: 'uploaded',
    ...overrides,
  };
}

export function makeKycStatus(overrides: Partial<KycStatusResponse> = {}): KycStatusResponse {
  return { kyc_status: 'not_started', documents: [], ...overrides };
}
