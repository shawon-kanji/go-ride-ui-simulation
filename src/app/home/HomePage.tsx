import { Activity, Car, Map, Truck, type LucideIcon } from 'lucide-react';
import { useEffect } from 'react';
import { Link } from 'react-router';

const ENTRIES: { to: string; icon: LucideIcon; title: string; body: string; tone: string }[] = [
  {
    to: '/user',
    icon: Car,
    title: 'Rider app',
    body: 'Book and track rides. Open one tab per rider.',
    tone: 'bg-[#e8f6ee] text-[#04562a]',
  },
  {
    to: '/driver',
    icon: Truck,
    title: 'Driver app',
    body: 'Go online, take offers, run trips. Open one tab per driver.',
    tone: 'bg-primary-50 text-primary-700',
  },
  {
    to: '/simulator',
    icon: Map,
    title: 'Simulator',
    body: 'See every open tab, set their locations, follow the events.',
    tone: 'bg-amber-50 text-amber-800',
  },
  {
    to: '/health',
    icon: Activity,
    title: 'Service health',
    body: 'Check that every Go service is reachable through the dev proxy.',
    tone: 'bg-neutral-100 text-neutral-700',
  },
];

export function HomePage() {
  useEffect(() => {
    document.title = 'Go Ride Simulator';
  }, []);

  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="text-[32px] font-extrabold tracking-[-0.02em]">Go Ride simulator</h1>
      <p className="mt-2 max-w-xl text-[15px] text-neutral-600">
        Browser versions of the rider and driver apps, running against the local backend. Every tab is its own device
        with its own login — open as many as you need, in the same browser.
      </p>

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        {ENTRIES.map(({ to, icon: Icon, title, body, tone }) => (
          <Link
            key={to}
            to={to}
            target={to === '/health' ? undefined : '_blank'}
            className="group rounded-card bg-white p-5 shadow-sm transition-shadow hover:shadow-md"
          >
            <span className={`inline-flex h-10 w-10 items-center justify-center rounded-control ${tone}`}>
              <Icon size={20} />
            </span>
            <p className="mt-3 text-[17px] font-extrabold">{title}</p>
            <p className="mt-1 text-[14px] text-neutral-600">{body}</p>
            <p className="mt-3 font-mono text-[12px] text-neutral-400 group-hover:text-neutral-600">{to}</p>
          </Link>
        ))}
      </div>

      <p className="mt-8 text-[13px] text-neutral-500">
        Tip: open new tabs from links or the address bar. The browser's “Duplicate tab” copies the session, so a
        duplicated tab starts signed out as a fresh device.
      </p>
    </main>
  );
}
