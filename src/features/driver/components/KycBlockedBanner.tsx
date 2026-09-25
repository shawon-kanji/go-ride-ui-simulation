import { TriangleAlert } from 'lucide-react';

import type { KycBlockReason } from '../kyc/kyc-errors';

// Copy from go-ride-driver-app's KycBlockedBanner. The Verify screens are Phase 6, so
// the web version names the fix instead of linking to it.

const MESSAGES: Record<KycBlockReason, string> = {
  identity: "Your identity documents aren't approved yet. Upload or fix them to activate a vehicle and go online.",
  vehicle:
    "This vehicle's documents aren't approved yet. Upload or fix this vehicle's documents before activating it.",
};

export function KycBlockedBanner({ reason }: { reason: KycBlockReason }) {
  return (
    <div className="flex items-start gap-3 rounded-control bg-warning-50 px-3 py-3 text-warning-700">
      <TriangleAlert size={18} strokeWidth={2} className="mt-px shrink-0" />
      <p className="flex-1 text-[14px] font-semibold">{MESSAGES[reason]}</p>
    </div>
  );
}
