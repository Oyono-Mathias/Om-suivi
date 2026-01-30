"use client";

import React from "react";
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
import { collection, doc, query, where } from "firebase/firestore";
import { Button } from "./ui/button";
import LanguageSwitcher from "./language-switcher";
import { useTranslations } from "next-intl";
import type { Profile, AbsenceJustification } from "@/lib/types";
import { useIsMobile } from "@/hooks/use-mobile";
import MobileBottomNav from "./mobile-bottom-nav";
import { Skeleton } from "./ui/skeleton";

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
  
  // Define all possible navigation items
  const mainNavItems = [
    { href: "/", label: t('timeTracking'), icon: Clock },
    { href: "/reports", label: t('reports'), icon: BarChart3 },
    { href: "/bulletin", label: t('bulletin'), icon: Newspaper },
  ];
  const secondaryNavItems = [
    { href: "/team", label: t('team'), icon: Users },
    { href: "/profile", label: t('settings'), icon: Settings },
    { href: "/faq", label: t('faq'), icon: HelpCircle },
  ];
  const adminNavItems = [{ 
    href: "/admin", 
    label: t('administration'), 
    icon: Shield,
    badge: pendingCount > 0 ? pendingCount : undefined
  }];

  // Pages without the main shell
  if (pathname.includes('/login') || pathname.includes('/reports/export') || pathname.includes('/leave')) {
    return <>{children}</>;
  }

  // Loading skeleton
  if (isMobile === undefined) {
    return <Skeleton className="w-full h-screen" />;
  }

  // Mobile Layout
  if (isMobile) {
    return (
      <SidebarProvider>
        <Sidebar className="no-print">
          {/* Mobile Drawer Content */}
          <SidebarHeader className="p-4 border-b">
            {user && (
              <div className="flex items-center gap-3">
                <Avatar className="h-10 w-10">
                  <AvatarImage src={user.photoURL || "https://picsum.photos/seed/101/100/100"} data-ai-hint="person portrait" alt={user.displayName || t('user')} />
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

        {/* Main Content Area for Mobile */}
        <div className="flex flex-col min-h-screen bg-background">
          <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b bg-background/95 px-4 backdrop-blur-sm no-print">
            <div className="flex items-center gap-2">
              <SidebarTrigger /> {/* Hamburger Menu to open the drawer */}
            </div>
             <div className="flex items-center gap-2">
                <Link href="/profile">
                    <Avatar className="h-8 w-8">
                    <AvatarImage src={user?.photoURL || "https://picsum.photos/seed/101/100/100"} alt={user?.displayName || t('user')} />
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

  // Desktop Layout
  return (
    <SidebarProvider>
      <Sidebar className="no-print">
        <SidebarHeader className="p-4">
          <div className="flex items-center gap-3">
            <Image src="/logo-om.png" alt="OM Suivi Logo" width={32} height={32} className="rounded-md" />
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
                    <AvatarImage src={user.photoURL || "https://picsum.photos/seed/101/100/100"} data-ai-hint="person portrait" alt={user.displayName || t('user')} />
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
        <header className="sticky top-0 z-10 flex h-14 items-center gap-4 border-b bg-background/80 px-4 backdrop-blur-sm no-print">
          <SidebarTrigger />
          <h1 className="text-lg font-semibold">{t('appName')}</h1>
        </header>
        <main className="flex-1 p-4 sm:p-6 print:p-0">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
