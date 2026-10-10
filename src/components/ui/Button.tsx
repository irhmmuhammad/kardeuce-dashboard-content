import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

type Variant = 'primary' | 'brand' | 'secondary' | 'ghost' | 'danger' | 'subtle';
type Size = 'xs' | 'sm' | 'md' | 'icon' | 'icon-sm';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  icon?: ReactNode;
  iconRight?: ReactNode;
  loading?: boolean;
}

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-ink text-white hover:bg-ink-2 active:bg-black border border-ink',
  brand: 'bg-brand text-ink hover:bg-[#a9da57] active:bg-brand-strong border border-[#a3d257]',
  secondary: 'bg-white text-ink border border-line hover:border-line-strong hover:bg-canvas',
  ghost: 'bg-transparent text-ink-2 hover:bg-muted hover:text-ink border border-transparent',
  subtle: 'bg-muted text-ink-2 hover:bg-[#e4e8de] hover:text-ink border border-transparent',
  danger: 'bg-white text-red-600 border border-red-200 hover:bg-red-50 hover:border-red-300',
};

const SIZES: Record<Size, string> = {
  xs: 'h-7 px-2 text-[12px] gap-1 rounded-lg',
  sm: 'h-8 px-2.5 text-[12.5px] gap-1.5 rounded-[9px]',
  md: 'h-9 px-3.5 text-[13px] gap-2 rounded-[10px]',
  icon: 'h-9 w-9 justify-center rounded-[10px]',
  'icon-sm': 'h-7 w-7 justify-center rounded-lg',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', icon, iconRight, loading, className, children, disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        'inline-flex shrink-0 items-center font-medium whitespace-nowrap transition-colors outline-none select-none focus-visible:ring-4 focus-visible:ring-brand/40 disabled:opacity-50',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...rest}
    >
      {loading ? (
        <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-r-transparent" />
      ) : (
        icon
      )}
      {children}
      {iconRight}
    </button>
  );
});
