'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { focusRing } from './ui';

const LINKS = [
  { href: '/dashboard', label: 'Anfragen' },
  { href: '/dashboard/report', label: 'Kanäle' },
] as const;

/** Header tabs. The active tab gets a terracotta underline (decoration) plus aria-current (meaning). */
export function DashboardNav() {
  const path = usePathname();
  return (
    <nav aria-label="Bereiche" className="flex gap-1 self-stretch">
      {LINKS.map(({ href, label }) => {
        const active = path === href;
        return (
          <Link key={href} href={href} aria-current={active ? 'page' : undefined}
            className={`relative flex items-center px-3 text-sm transition-colors ${focusRing} ${
              active ? 'font-medium text-white after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:rounded-full after:bg-terracotta'
                : 'text-white/70 hover:text-white'}`}>
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
