import type { HTMLAttributes } from 'react';

// Web port of go-ride-driver-app/src/components/Card.tsx. Radius follows the theme
// (16px driver, 18px rider).

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  onPress?: () => void;
}

export function Card({ onPress, className = '', children, ...rest }: CardProps) {
  const classes = `rounded-card border border-neutral-200 bg-white p-4 ${className}`;

  if (onPress) {
    return (
      <div
        role="button"
        tabIndex={0}
        onClick={onPress}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') onPress();
        }}
        className={`${classes} active:bg-neutral-50`}
        {...rest}
      >
        {children}
      </div>
    );
  }

  return (
    <div className={classes} {...rest}>
      {children}
    </div>
  );
}
