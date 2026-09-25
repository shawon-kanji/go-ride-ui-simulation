import { Link, useNavigate } from 'react-router';

import { ROLE_BASE } from '../../shared/tab/routes';
import type { Role } from '../../shared/tab/types';
import { ScreenHeader } from '../../shared/ui/ScreenHeader';
import { SignupForm } from './SignupForm';

// Layout ported from go-ride-driver-app's (auth)/signup.tsx (D02 Sign up).

const TITLE: Record<Role, string> = {
  driver: 'Create your driver account',
  rider: 'Create your account',
};

export function SignupScreen({ role }: { role: Role }) {
  const navigate = useNavigate();
  const loginHref = `${ROLE_BASE[role]}/login`;

  return (
    <div className="flex flex-1 flex-col overflow-hidden bg-white">
      <ScreenHeader title={TITLE[role]} onBack={() => navigate(loginHref)} />

      <div className="flex-1 overflow-y-auto px-[22px] pt-5 pb-6">
        <SignupForm role={role} />
      </div>

      <div className="border-t border-neutral-200 px-[22px] pt-4 pb-6">
        <p className="text-center text-[15px] text-neutral-500">
          Already registered?{' '}
          <Link to={loginHref} className="font-bold text-primary-600">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
