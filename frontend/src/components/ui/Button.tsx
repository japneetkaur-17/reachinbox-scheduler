import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Spinner } from './Spinner';

type Variant = 'primary' | 'outline' | 'mint' | 'ghost';
type Size = 'sm' | 'md' | 'lg';

const variants: Record<Variant, string> = {
  primary: 'bg-brand-500 text-white hover:bg-brand-600',
  outline: 'border border-brand-500 bg-white text-brand-500 hover:bg-brand-50',
  mint: 'bg-mint text-ink hover:bg-brand-100',
  ghost: 'bg-transparent text-ink-muted hover:bg-field hover:text-ink',
};

const sizes: Record<Size, string> = {
  sm: 'h-8 px-4 text-sm gap-1.5',
  md: 'h-10 px-5 text-sm gap-2',
  lg: 'h-16 px-6 text-xl gap-3',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  shape?: 'pill' | 'rounded';
  loading?: boolean;
  icon?: ReactNode;
  block?: boolean;
}

export function Button({
  variant = 'primary',
  size = 'md',
  shape = 'pill',
  loading = false,
  icon,
  block,
  disabled,
  className = '',
  children,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      {...rest}
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center font-medium transition-colors focus-visible:outline-none
        focus-visible:ring-4 focus-visible:ring-brand-500/20 disabled:cursor-not-allowed disabled:opacity-60
        ${shape === 'pill' ? 'rounded-full' : 'rounded-2xl'} ${variants[variant]} ${sizes[size]} ${block ? 'w-full' : ''} ${className}`}
    >
      {loading ? <Spinner size="sm" /> : icon}
      {children}
    </button>
  );
}

/** Square icon-only button (toolbar icons, back arrows, star...). */
export function IconButton({
  label,
  children,
  active,
  className = '',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; active?: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      {...rest}
      className={`inline-flex h-8 w-8 items-center justify-center rounded-md transition-colors disabled:cursor-not-allowed disabled:opacity-40
        ${active ? 'bg-field text-ink' : 'text-ink-faint hover:bg-field hover:text-ink'} ${className}`}
    >
      {children}
    </button>
  );
}
