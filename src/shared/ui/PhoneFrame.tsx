import type { ReactNode } from 'react';

import type { Role } from '../tab/types';

// The handoff frames every screen in a 428 × 908 device with a 396px content width.
// The frame here is a plain rounded bezel (android-frame.jsx is presentation-only and
// not ported). The screen height shrinks to fit shorter laptop viewports. Below 480px
// the bezel disappears and the app fills the viewport, like a real phone.

interface PhoneFrameProps {
  role: Role;
  children: ReactNode;
  aside?: ReactNode;
}

export function PhoneFrame({ role, children, aside }: PhoneFrameProps) {
  return (
    <div className="flex min-h-full items-center justify-center gap-6 p-6 max-[480px]:block max-[480px]:p-0">
      <div className="shrink-0 rounded-[48px] bg-neutral-900 p-4 shadow-[0_30px_60px_rgba(16,22,20,0.25)] max-[480px]:rounded-none max-[480px]:bg-transparent max-[480px]:p-0 max-[480px]:shadow-none">
        <div
          data-theme={role}
          className="relative flex h-[min(876px,calc(100dvh-80px))] w-[396px] flex-col overflow-hidden rounded-[34px] bg-white max-[480px]:h-dvh max-[480px]:w-full max-[480px]:rounded-none"
        >
          {children}
        </div>
      </div>
      {aside}
    </div>
  );
}
