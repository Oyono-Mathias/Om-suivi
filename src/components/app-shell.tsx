"use client";

import React, { useEffect, useState } from "react";
import Image from "next/image";
import { usePathname, Link } from "@/navigation";
import {
  SidebarProvider,
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarInset,
  SidebarTrigger,
  SidebarSeparator,
  SidebarMenuBadge,
} from "@/components/ui/sidebar";
import {
  BarChart3,
  Clock,
  Settings,
  Users,
  LogOut,
  Shield,
  Newspaper,
  HelpCircle,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useUser, useAuth, useFirestore, useDoc, useMemoFirebase, useCollection } from "@/firebase";
import { signOut } from "firebase/auth";
import { collection, doc, query, where, orderBy, limit } from "firebase/firestore";
import { Button } from "./ui/button";
import LanguageSwitcher from "./language-switcher";
import { useTranslations } from "next-intl";
import type { Profile, AbsenceJustification, Notification } from "@/lib/types";
import { useIsMobile } from "@/hooks/use-mobile";
import MobileBottomNav from "./mobile-bottom-nav";
import { Skeleton } from "./ui/skeleton";
import { PlaceHolderImages } from "@/lib/placeholder-images";
import { requestNotificationPermission } from "@/lib/firebase-messaging";
import AdvancementDialog from "./advancement-dialog";

type AppPath = any;
interface NavItem {
  href: AppPath;
  label: string;
  icon: React.ElementType;
  badge?: number;
}

function NotificationHandler() {
    const { user } = useUser();
    const firestore = useFirestore();
    const [activeNotification, setActiveNotification] = useState<Notification | null>(null);

    const notificationsQuery = useMemoFirebase(() => {
        if (!user) return null;
        return query(collection(firestore, 'users', user.uid, 'notifications'), where('isRead', '==', false), orderBy('createdAt', 'desc'), limit(1));
    }, [firestore, user]);

    const { data: unreadNotifications } = useCollection<Notification>(notificationsQuery);

    useEffect(() => {
        if (unreadNotifications && unreadNotifications.length > 0) {
            setActiveNotification(unreadNotifications[0]);
        }
    }, [unreadNotifications]);

    const handleClose = () => {
        setActiveNotification(null);
    }

    if (!activeNotification) return null;

    if (activeNotification.type === 'advancement') {
        return <AdvancementDialog notification={activeNotification} onClose={handleClose} />;
    }
    
    return null;
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user } = useUser();
  const auth = useAuth();
  const firestore = useFirestore();
  const t = useTranslations("AppShell");
  const isMobile = useIsMobile();

  const userProfileRef = useMemoFirebase(() => {
    if (!user) return null;
    return doc(firestore, 'users', user.uid);
  }, [firestore, user]);

  const { data: profile } = useDoc<Profile>(userProfileRef);

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/firebase-messaging-sw.js')
        .then(registration => {
          console.log('FCM Service Worker registered successfully:', registration.scope);
        }).catch(err => {
          console.error('FCM Service Worker registration failed:', err);
        });
    }
  }, []);

  useEffect(() => {
    if (user && firestore) {
      requestNotificationPermission(user.uid, firestore);
    }
  }, [user, firestore]);

  const userAvatar = PlaceHolderImages.find(p => p.id === 'mathias-oyono');

  const pendingJustificationsQuery = useMemoFirebase(() => {
    if (!firestore || profile?.role !== 'admin') return null;
    return query(collection(firestore, 'absenceJustifications'), where('status', '==', 'pending'));
  }, [firestore, profile]);

  const { data: pendingJustifications } = useCollection<AbsenceJustification>(pendingJustificationsQuery);
  const pendingCount = pendingJustifications?.length || 0;
  
  const handleSignOut = () => {
    if (auth) {
      signOut(auth);
    }
  };
  
  const mainNavItems: NavItem[] = [
    { href: "/", label: t('timeTracking'), icon: Clock },
    { href: "/reports", label: t('reports'), icon: BarChart3 },
    { href: "/bulletin", label: t('bulletin'), icon: Newspaper },
  ];
  const secondaryNavItems: NavItem[] = [
    { href: "/team", label: t('team'), icon: Users },
    { href: "/profile", label: t('settings'), icon: Settings },
    { href: "/faq", label: t('faq'), icon: HelpCircle },
  ];
  const adminNavItems: NavItem[] = [{ 
    href: "/admin", 
    label: t('administration'), 
    icon: Shield,
    badge: pendingCount > 0 ? pendingCount : undefined
  }];

  if (pathname.includes('/login') || pathname.includes('/reports/export') || pathname.includes('/leave')) {
    return <>{children}</>;
  }

  if (isMobile === undefined) {
    return <Skeleton className="w-full h-screen" />;
  }

  if (isMobile) {
    return (
      <SidebarProvider>
        <NotificationHandler />
        <Sidebar className="no-print">
          <SidebarHeader className="p-4 border-b">
            {user && (
              <div className="flex items-center gap-3">
                <Avatar className="h-10 w-10">
                  <AvatarImage src={user.photoURL || userAvatar?.imageUrl} data-ai-hint={userAvatar?.imageHint || "person portrait"} alt={user.displayName || t('user')} />
                  <AvatarFallback>{user.displayName?.charAt(0) || 'U'}</AvatarFallback>
                </Avatar>
                <div className="flex flex-col">
                  <span className="font-medium text-sidebar-foreground truncate">{user.displayName || user.email}</span>
                  {profile?.role && <span className="text-xs text-muted-foreground capitalize">{profile.role}</span>}
                </div>
              </div>
            )}
          </SidebarHeader>
          <SidebarContent>
            <SidebarMenu>
              {secondaryNavItems.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton asChild isActive={pathname === item.href} onClick={() => {
                    const sidebar = document.querySelector('[data-sidebar="sidebar"][data-mobile="true"]');
                    if (sidebar) {
                      const closeButton = sidebar.querySelector('button[aria-label="Close"]');
                      if (closeButton instanceof HTMLElement) {
                        closeButton.click();
                      }
                    }
                  }}>
                    <Link href={item.href}><item.icon /><span>{item.label}</span></Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
              {profile?.role === 'admin' && adminNavItems.map((item) => (
                <SidebarMenuItem key={item.href}>
                   <SidebarMenuButton asChild isActive={pathname === item.href} onClick={() => {
                    const sidebar = document.querySelector('[data-sidebar="sidebar"][data-mobile="true"]');
                    if (sidebar) {
                      const closeButton = sidebar.querySelector('button[aria-label="Close"]');
                      if (closeButton instanceof HTMLElement) {
                        closeButton.click();
                      }
                    }
                  }}>
                    <Link href={item.href}><item.icon /><span>{item.label}</span></Link>
                  </SidebarMenuButton>
                  {item.badge && <SidebarMenuBadge>{item.badge}</SidebarMenuBadge>}
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarContent>
          <SidebarFooter className="p-4 flex flex-col gap-4 border-t">
            <LanguageSwitcher />
            {user && <Button variant="ghost" className="w-full justify-start text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground" onClick={handleSignOut}><LogOut className="mr-2" /> {t('signOut')}</Button>}
          </SidebarFooter>
        </Sidebar>

        <div className="flex flex-col min-h-screen bg-background">
          <header className="flex h-14 items-center justify-between border-b bg-background px-4 no-print">
            <div className="flex items-center gap-2">
              <SidebarTrigger />
              <Image src="/logo-omsuivi.png" alt="OM Suivi Logo" width={32} height={32} className="rounded-full" />
            </div>
             <div className="flex items-center gap-2">
                <Link href="/profile">
                    <Avatar className="h-8 w-8">
                    <AvatarImage src={user?.photoURL || userAvatar?.imageUrl} data-ai-hint={userAvatar?.imageHint || "person portrait"} alt={user?.displayName || t('user')} />
                    <AvatarFallback>{user?.displayName?.charAt(0) || 'U'}</AvatarFallback>
                    </Avatar>
                </Link>
            </div>
          </header>
          <main className="flex-1 p-4 pb-32 print:p-0">{children}</main>
          {user && <MobileBottomNav />}
        </div>
      </SidebarProvider>
    );
  }

  return (
    <SidebarProvider>
      <Sidebar className="no-print">
        <SidebarHeader className="p-4">
          <div className="flex items-center gap-3">
            <Image src="/logo-omsuivi.png" alt="OM Suivi Logo" width={32} height={32} className="rounded-full" />
            <div className="flex flex-col">
              <span className="text-lg font-headline font-semibold text-sidebar-foreground">{t('appName')}</span>
            </div>
          </div>
        </SidebarHeader>
        <SidebarContent>
          <SidebarMenu>
            {[...mainNavItems, ...secondaryNavItems].map((item) => (
              <SidebarMenuItem key={item.href}>
                 <SidebarMenuButton asChild isActive={pathname === item.href} tooltip={item.label}><Link href={item.href}><item.icon /><span>{item.label}</span></Link></SidebarMenuButton>
              </SidebarMenuItem>
            ))}
            {profile?.role === 'admin' && (
              <>
                <SidebarSeparator />
                {adminNavItems.map((item) => (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton asChild isActive={pathname === item.href} tooltip={item.label}><Link href={item.href}><item.icon /><span>{item.label}</span></Link></SidebarMenuButton>
                    {item.badge && <SidebarMenuBadge>{item.badge}</SidebarMenuBadge>}
                  </SidebarMenuItem>
                ))}
              </>
            )}
          </SidebarMenu>
        </SidebarContent>
        <SidebarFooter className="p-4 flex flex-col gap-4">
            <LanguageSwitcher />
            {user && (
                <div className="flex items-center gap-3">
                    <Avatar className="h-9 w-9">
                    <AvatarImage src={user.photoURL || userAvatar?.imageUrl} data-ai-hint={userAvatar?.imageHint || "person portrait"} alt={user.displayName || t('user')} />
                    <AvatarFallback>{user.displayName?.charAt(0) || 'U'}</AvatarFallback>
                    </Avatar>
                    <span className="font-medium text-sm text-sidebar-foreground truncate">{user.displayName || user.email}</span>
              </div>
            )}
             {user && (
                <Button variant="ghost" className="w-full justify-start text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground" onClick={handleSignOut}><LogOut className="mr-2" /> {t('signOut')}</Button>
            )}
        </SidebarFooter>
      </Sidebar>
      <SidebarInset>
        <NotificationHandler />
        <header className="sticky top-0 z-10 flex h-14 items-center justify-between border-b bg-background/80 px-4 backdrop-blur-sm no-print">
            <div className="flex items-center gap-4">
                <SidebarTrigger />
                <h1 className="text-lg font-semibold">{t('appName')}</h1>
            </div>
            <div className="flex items-center gap-2">
                <Link href="/profile">
                    <Avatar className="h-8 w-8">
                    <AvatarImage src={user?.photoURL || userAvatar?.imageUrl} data-ai-hint={userAvatar?.imageHint || "person portrait"} alt={user?.displayName || t('user')} />
                    <AvatarFallback>{user?.displayName?.charAt(0) || 'U'}</AvatarFallback>
                    </Avatar>
                </Link>
            </div>
        </header>
        <main className="flex-1 p-4 sm:p-6 print:p-0">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
