import { ChevronLeft, Inbox } from 'lucide-react';
import { useMemo } from 'react';
import { useNavigate } from 'react-router';

import { Banner } from '../../../shared/ui/Banner';
import { Button } from '../../../shared/ui/Button';
import { useDriverProfileQuery, useSetPausedMutation } from '../api/queries';
import { OfferCard } from '../offers/OfferCard';
import { bestOfferId, countOpen, sortOffers, useOfferStore } from '../offers/offer-store';
import { useAcceptOffer } from '../offers/use-accept-offer';

// D08 Job offers: dark header with the live count and a Pause chip, then one card per
// offer, each with its own timer. Accept-only — the backend has no reject endpoint,
// an ignored offer simply expires.

export function OffersScreen() {
  const navigate = useNavigate();
  const offersById = useOfferStore((s) => s.offers);
  const { data: profile } = useDriverProfileQuery();
  const setPaused = useSetPausedMutation();
  const { accept, error, clearError } = useAcceptOffer();

  const cards = useMemo(() => sortOffers(Object.values(offersById)), [offersById]);
  const best = bestOfferId(cards);
  const openCount = countOpen(cards);
  const isPaused = profile?.driver.is_paused === true;

  return (
    <div className="flex flex-1 flex-col overflow-hidden bg-neutral-50">
      <header className="bg-neutral-900 px-5 pt-4 pb-5 text-white">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => navigate('/driver')}
            aria-label="Back to map"
            className="-ml-2 flex h-9 w-9 items-center justify-center text-white/80 hover:text-white"
          >
            <ChevronLeft size={22} />
          </button>
          <span className={`h-2 w-2 rounded-full ${isPaused ? 'bg-warning-500' : 'bg-success-500'}`} />
          <p className="flex-1 text-[13px] font-bold uppercase tracking-[0.1em] text-[#a5b4fc]">
            {isPaused ? 'Paused' : 'Online'} · {openCount} {openCount === 1 ? 'offer' : 'offers'} waiting
          </p>
          <button
            type="button"
            onClick={() => setPaused.mutate(!isPaused)}
            disabled={setPaused.isPending}
            className="rounded-pill bg-white/15 px-3 py-1.5 text-[13px] font-bold hover:bg-white/25"
          >
            {isPaused ? 'Resume' : 'Pause'}
          </button>
        </div>
        <h1 className="mt-3 text-[22px] font-extrabold tracking-[-0.01em]">Pick the trip that suits you</h1>
        <p className="mt-1.5 text-[13px] text-white/70">
          Each offer has its own timer. First driver to accept gets it — there&apos;s no decline, an offer you ignore
          just moves on.
        </p>
      </header>

      <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-4 pt-4 pb-6">
        {error && <Banner message={error} variant="error" onDismiss={clearError} />}

        {cards.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
            <Inbox size={36} className="text-neutral-300" />
            <p className="text-[17px] font-extrabold text-neutral-900">No offers right now</p>
            <p className="text-[14px] text-neutral-500">
              New trips near you appear here as soon as dispatch sends them.
            </p>
            <div className="mt-2 w-full">
              <Button label="Back to map" variant="ghost" shape="pill" onClick={() => navigate('/driver')} />
            </div>
          </div>
        ) : (
          cards.map((card) => (
            <OfferCard
              key={card.offer.job_offer_id}
              card={card}
              best={card.offer.job_offer_id === best}
              onAccept={(id) => void accept(id)}
            />
          ))
        )}

        {cards.length > 0 && (
          <p className="px-2 pt-1 text-center text-[12px] text-neutral-500">
            Offers you haven&apos;t answered are sent again if your connection drops.
          </p>
        )}
      </div>
    </div>
  );
}
