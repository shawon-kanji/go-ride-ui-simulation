import { useTodayEarningsQuery, useTodayOnlineTimeQuery } from '../api/queries';
import { formatMinutes, formatMoney } from '../../../shared/lib/format';

// Web port of go-ride-driver-app's StatCards (D06 bottom sheet).

function StatCard({ eyebrow, value, subtext }: { eyebrow: string; value: string; subtext: string }) {
  return (
    <div className="flex-1 rounded-control bg-neutral-50 p-[14px]">
      <p className="text-[12px] font-bold uppercase tracking-[0.08em] text-neutral-500">{eyebrow}</p>
      <p className="mt-1 text-[24px] font-extrabold tracking-[-0.02em] text-neutral-900">{value}</p>
      <p className="mt-0.5 text-[13px] text-neutral-500">{subtext}</p>
    </div>
  );
}

export function StatCards() {
  const { data: earnings } = useTodayEarningsQuery();
  const { data: onlineTime } = useTodayOnlineTimeQuery();

  const trips = earnings?.trip_count ?? 0;
  const minutes = onlineTime?.total_minutes ?? 0;

  return (
    <div className="flex gap-3">
      <StatCard
        eyebrow="Today"
        value={formatMoney(earnings?.total_earnings ?? 0, earnings?.currency_code)}
        subtext={`${trips} ${trips === 1 ? 'trip' : 'trips'}`}
      />
      <StatCard
        eyebrow="Online time"
        value={formatMinutes(minutes)}
        // The backend has no session start time, so the design's "since 06:30"
        // isn't renderable — same wording the app uses.
        subtext={minutes > 0 ? 'Today so far' : 'Not online yet'}
      />
    </div>
  );
}
