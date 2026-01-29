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
  <Link href={href} className="flex flex-col items-center justify-center gap-1 h-full">
    <div className={cn("p-2 rounded-full transition-colors", isActive ? "bg-primary/10" : "")}>
        <Icon className={cn("transition-all", isActive ? "h-6 w-6 text-primary" : "h-5 w-5 text-muted-foreground")} />
    </div>
    <span className={cn("transition-colors text-[10px]", isActive ? "text-primary font-medium" : "text-muted-foreground")}>{label}</span>
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
    <nav className="fixed bottom-5 inset-x-4 z-40 flex h-[70px] items-stretch justify-between px-6 border border-white/10 bg-black/50 backdrop-blur-lg rounded-[20px] shadow-2xl md:hidden">
      {navItems.map((item) => (
        <NavLink key={item.href} {...item} isActive={pathname === item.href} />
      ))}
      {profile?.role === 'admin' && (
        <NavLink {...adminNavItem} isActive={pathname === adminNavItem.href} />
      )}
    </nav>
  );
}
