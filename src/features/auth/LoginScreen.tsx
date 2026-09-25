import { Car, Lock, Truck, type LucideIcon } from 'lucide-react';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';

import { sessionStores } from '../../shared/session/session-store';
import type { Role } from '../../shared/tab/types';
import { Banner } from '../../shared/ui/Banner';
import { LoginForm } from './LoginForm';

// Layout ported from go-ride-driver-app's (auth)/login.tsx (D01 Sign in): brand header
// with wordmark, 30px/800 title, then the form on white. The rider app has no designed
// sign-in screen, so the rider version reuses this layout in the rider theme.

const COPY: Record<Role, { icon: LucideIcon; wordmark: string; signupPrompt: string; signupLink: string; signupHref: string }> = {
  driver: {
    icon: Truck,
    wordmark: 'GO RIDE DRIVER',
    signupPrompt: 'New driver? ',
    signupLink: 'Create an account',
    signupHref: '/driver/signup',
  },
  rider: {
    icon: Car,
    wordmark: 'GO RIDE',
    signupPrompt: "Don't have an account? ",
    signupLink: 'Sign up',
    signupHref: '/user/signup',
  },
};

export function LoginScreen({ role }: { role: Role }) {
  const [params] = useSearchParams();
  const email = params.get('email') ?? undefined;
  const copy = COPY[role];
  const Icon = copy.icon;

  // Read-and-clear the session store's expiry reason once, at mount.
  const [infoMessage, setInfoMessage] = useState<string | null>(() => {
    const reason = sessionStores[role].getState().consumeSessionExpiredReason();
    if (reason) return reason;
    if (email) return 'Account created — please log in.';
    return null;
  });

  return (
    <div className="flex flex-1 flex-col overflow-hidden bg-white">
      <div className="bg-primary-500 px-[22px] pt-[34px] pb-[30px] text-white">
        <div className="flex items-center gap-[10px]">
          <Icon size={24} strokeWidth={2} />
          <p className="text-[15px] font-bold tracking-[0.14em] text-white/90">{copy.wordmark}</p>
        </div>
        <h1 className="mt-3 text-[30px] font-extrabold tracking-[-0.02em]">Welcome back</h1>
        <p className="mt-2 text-[15px] text-white/[0.82]">
          {role === 'driver'
            ? "Sign in to start your shift. Sessions last 60 minutes, then you'll be asked again."
            : "Sign in to book a ride. Sessions last 60 minutes, then you'll be asked again."}
        </p>
      </div>

      <div className="flex flex-1 flex-col overflow-y-auto px-[22px] pt-[26px] pb-6">
        {infoMessage && <Banner message={infoMessage} variant="info" onDismiss={() => setInfoMessage(null)} />}

        <LoginForm role={role} initialEmail={email} />

        <p className="mt-4 text-center text-[15px] text-neutral-500">
          {copy.signupPrompt}
          <Link to={copy.signupHref} className="font-bold text-primary-600">
            {copy.signupLink}
          </Link>
        </p>

        <div className="mt-auto flex items-start gap-2 rounded-control bg-neutral-50 px-3 py-3 text-neutral-600">
          <Lock size={16} strokeWidth={2} className="mt-px shrink-0" />
          <p className="flex-1 text-[13px]">
            This tab keeps its own session: reloading keeps you signed in, closing the tab signs you out.
          </p>
        </div>
      </div>
    </div>
  );
}
