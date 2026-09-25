import { CircleCheck, CircleX, LoaderCircle, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router';

// Pings every service through the Vite proxy, so a green row means both that the Go
// service is up and that its proxy route is wired correctly.

const SERVICES = [
  { name: 'go-ride-backend', detail: 'auth · profiles · vehicles · KYC · places', path: '/healthz', port: 8080 },
  { name: 'location-producers', detail: 'GPS ingest', path: '/api/v1/location/healthz', port: 8081 },
  { name: 'cab-request-handler', detail: 'rider trips', path: '/api/v1/cab/healthz', port: 8082 },
  { name: 'websocket-gateway', detail: 'realtime push', path: '/api/v1/ws/healthz', port: 8083 },
  { name: 'driver-request-handler', detail: 'driver trips', path: '/api/v1/driver-trips/healthz', port: 8084 },
] as const;

type Status = { state: 'checking' } | { state: 'up'; ms: number } | { state: 'down'; reason: string };

async function check(path: string): Promise<Status> {
  const startedAt = performance.now();
  try {
    const response = await fetch(path, { cache: 'no-store' });
    const ms = Math.round(performance.now() - startedAt);
    return response.ok ? { state: 'up', ms } : { state: 'down', reason: `HTTP ${response.status}` };
  } catch (error) {
    return { state: 'down', reason: String(error) };
  }
}

export function HealthPage() {
  const [statuses, setStatuses] = useState<Record<string, Status>>({});

  // Results land asynchronously, one row at a time. Rows without a result show as checking.
  const checkAll = useCallback(() => {
    SERVICES.forEach(async (service) => {
      const status = await check(service.path);
      setStatuses((prev) => ({ ...prev, [service.path]: status }));
    });
  }, []);

  const recheck = () => {
    setStatuses({});
    checkAll();
  };

  useEffect(() => {
    document.title = 'Go Ride · Health';
    checkAll();
  }, [checkAll]);

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <Link to="/" className="text-[13px] font-semibold text-neutral-500 hover:text-neutral-800">
        ← Go Ride simulator
      </Link>
      <div className="mt-2 flex items-center justify-between">
        <h1 className="text-[24px] font-extrabold tracking-[-0.02em]">Service health</h1>
        <button
          type="button"
          onClick={recheck}
          className="flex items-center gap-2 rounded-control bg-white px-3 py-2 text-[13px] font-semibold shadow-sm"
        >
          <RefreshCw size={14} /> Re-check
        </button>
      </div>

      <ul className="mt-6 divide-y divide-neutral-200 overflow-hidden rounded-card bg-white shadow-sm">
        {SERVICES.map((service) => {
          const status = statuses[service.path] ?? { state: 'checking' };
          return (
            <li key={service.path} className="flex items-center gap-3 px-4 py-3">
              {status.state === 'checking' && <LoaderCircle size={20} className="animate-spin text-neutral-400" />}
              {status.state === 'up' && <CircleCheck size={20} className="text-success-500" />}
              {status.state === 'down' && <CircleX size={20} className="text-danger-500" />}
              <div className="min-w-0 flex-1">
                <p className="font-bold">
                  {service.name} <span className="font-normal text-neutral-400">:{service.port}</span>
                </p>
                <p className="text-[13px] text-neutral-500">
                  {service.detail} · <code className="text-[12px]">{service.path}</code>
                </p>
              </div>
              <p className="text-[13px] text-neutral-500">
                {status.state === 'up' && `${status.ms} ms`}
                {status.state === 'down' && status.reason}
              </p>
            </li>
          );
        })}
      </ul>
    </main>
  );
}
