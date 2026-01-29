'use client';

import React from 'react';
import { usePathname, Link } from '@/navigation';
import { BarChart3, Clock, Settings, Users, Shield, Newspaper } from 'lucide-react';
import { useUser, useFirestore, useDoc, useMemoFirebase } from '@/firebase';
import { doc } from 'firebase/firestore';
import { useTranslations } from 'next-intl';
import type { Profile } from '@/lib/types';
import { cn } from '@/lib/utils';

const NavLink = ({ href, icon: Icon, label, isActive }: { href: string; icon: React.ElementType; label: string; isActive: boolean }) => (
  <Link href={href} className="flex flex-col items-center justify-center gap-1 text-xs flex-1 h-full">
    <div className={cn("p-2 rounded-full transition-colors", isActive ? "bg-primary/10" : "")}>
        <Icon className={cn("h-6 w-6 transition-colors", isActive ? "text-primary" : "text-muted-foreground")} />
    </div>
    <span className={cn("transition-colors text-xs", isActive ? "text-primary font-medium" : "text-muted-foreground")}>{label}</span>
  </Link>
);

export default function MobileBottomNav() {
  const pathname = usePathname();
  const { user } = useUser();
  const firestore = useFirestore();
  const t = useTranslations("AppShell");

  const userProfileRef = useMemoFirebase(() => {
    if (!user) return null;
    return doc(firestore, 'users', user.uid);
  }, [firestore, user]);

  const { data: profile } = useDoc<Profile>(userProfileRef);

  const navItems = [
    { href: "/", label: t('timeTracking'), icon: Clock },
    { href: "/reports", label: t('reports'), icon: BarChart3 },
    { href: "/bulletin", label: t('bulletin'), icon: Newspaper },
    { href: "/team", label: t('team'), icon: Users },
    { href: "/profile", label: t('settings'), icon: Settings },
  ];

  const adminNavItem = { href: "/admin", label: t('administration'), icon: Shield };

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 flex h-24 items-stretch justify-around border-t bg-background/95 backdrop-blur-sm md:hidden">
      {navItems.map((item) => (
        <NavLink key={item.href} {...item} isActive={pathname === item.href} />
      ))}
      {profile?.role === 'admin' && (
        <NavLink {...adminNavItem} isActive={pathname === adminNavItem.href} />
      )}
    </nav>
  );
}
