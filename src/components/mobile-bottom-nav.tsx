'use client';

import React from 'react';
import { usePathname, Link } from '@/navigation';
import { BarChart3, Clock, Newspaper } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';

const NavLink = ({ href, icon: Icon, label, isActive }: { href: any; icon: React.ElementType; label: string; isActive: boolean }) => (
  <Link href={href} className="flex flex-col items-center justify-center gap-1 h-full flex-1">
    <div className={cn("p-3 rounded-full transition-all duration-200", isActive ? "bg-primary/10" : "")}>
        <Icon className={cn("transition-transform duration-200", isActive ? "h-6 w-6 text-primary scale-110" : "h-5 w-5 text-muted-foreground")} />
    </div>
    <span className={cn("transition-colors text-[10px]", isActive ? "text-primary font-medium" : "text-muted-foreground")}>{label}</span>
  </Link>
);

export default function MobileBottomNav() {
  const pathname = usePathname();
  const t = useTranslations("AppShell");

  const navItems = [
    { href: "/", label: t('timeTracking'), icon: Clock },
    { href: "/bulletin", label: t('bulletin'), icon: Newspaper },
    { href: "/reports", label: t('reports'), icon: BarChart3 },
  ];

  return (
    <nav className="fixed bottom-5 inset-x-4 z-40 flex h-[70px] items-stretch justify-around px-2 border border-white/10 bg-black/80 backdrop-blur-lg rounded-2xl shadow-2xl md:hidden no-print">
      {navItems.map((item) => (
        <NavLink key={item.href} {...item} isActive={pathname === item.href} />
      ))}
    </nav>
  );
}
