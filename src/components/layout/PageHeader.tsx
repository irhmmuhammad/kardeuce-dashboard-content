import type { ReactNode } from 'react';
import { Menu as MenuIcon } from 'lucide-react';
import { useUI } from '@/store/ui';
import { cn } from '@/lib/utils';

interface PageHeaderProps {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  eyebrow?: ReactNode;
  className?: string;
}

export function PageHeader({ title, subtitle, actions, eyebrow, className }: PageHeaderProps) {
  const setMobileOpen = useUI((s) => s.setMobileNavOpen);
  return (
    <header className={cn('flex flex-wrap items-start gap-x-6 gap-y-3', className)}>
      <button
        type="button"
        onClick={() => setMobileOpen(true)}
        className="mt-0.5 rounded-lg border border-line bg-white p-2 text-ink md:hidden"
        aria-label="Open menu"
      >
        <MenuIcon className="h-4 w-4" />
      </button>
      <div className="min-w-0 flex-1">
        {eyebrow && <div className="mb-1 text-[11px] font-semibold tracking-[0.14em] text-ink-3 uppercase">{eyebrow}</div>}
        <h1 className="text-[22px] leading-tight font-bold tracking-tight text-ink sm:text-[26px]">{title}</h1>
        {subtitle && <p className="mt-1 text-[13.5px] text-ink-3">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}
