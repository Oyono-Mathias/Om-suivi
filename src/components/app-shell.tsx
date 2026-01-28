
"use client";

import React from "react";
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
} from "@/components/ui/sidebar";
import {
  BarChart3,
  Clock,
  Settings,
  Users,
  Briefcase,
  LogOut,
  Shield,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useUser, useAuth, useFirestore, useDoc, useMemoFirebase } from "@/firebase";
import { signOut } from "firebase/auth";
import { doc } from "firebase/firestore";
import { Button } from "./ui/button";
import LanguageSwitcher from "./language-switcher";
import { useTranslations } from "next-intl";
import type { Profile } from "@/lib/types";

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, isUserLoading } = useUser();
  const auth = useAuth();
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
    { href: "/team", label: t('team'), icon: Users },
    { href: "/profile", label: t('settings'), icon: Settings },
  ];
  
  const adminNavItems = [
    { href: "/admin", label: t('administration'), icon: Shield },
  ];

  const handleSignOut = () => {
    if (auth) {
      signOut(auth);
    }
  };
  
  // Do not render sidebar-dependent layout for the login page
  if (pathname.includes('/login')) {
    return <>{children}</>;
  }

  return (
    <SidebarProvider>
      <Sidebar className="no-print">
        <SidebarHeader className="p-4">
          <div className="flex items-center gap-3">
            <Briefcase className="w-8 h-8 text-sidebar-primary" />
            <div className="flex flex-col">
              <span className="text-lg font-headline font-semibold text-sidebar-foreground">
                {t('appName')}
              </span>
            </div>
          </div>
        </SidebarHeader>
        <SidebarContent>
          <SidebarMenu>
            {user && navItems.map((item) => (
              <SidebarMenuItem key={item.href}>
                 <SidebarMenuButton
                  asChild
                  isActive={pathname === item.href}
                  tooltip={item.label}
                >
                  <Link href={item.href}>
                    <item.icon />
                    <span>{item.label}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
            {profile?.role === 'admin' && (
              <>
                <SidebarSeparator />
                {adminNavItems.map((item) => (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      asChild
                      isActive={pathname === item.href}
                      tooltip={item.label}
                    >
                      <Link href={item.href}>
                        <item.icon />
                        <span>{item.label}</span>
                      </Link>
                    </SidebarMenuButton>
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
                    <span className="font-medium text-sm text-sidebar-foreground truncate">
                    {user.displayName || user.email}
                    </span>
              </div>
            )}
             {user && (
                <Button variant="ghost" className="w-full justify-start text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground" onClick={handleSignOut}>
                    <LogOut className="mr-2" /> {t('signOut')}
                </Button>
            )}
        </SidebarFooter>
      </Sidebar>
      <SidebarInset>
        <header className="sticky top-0 z-10 flex h-14 items-center gap-4 border-b bg-background/80 px-4 backdrop-blur-sm md:hidden no-print">
          <SidebarTrigger />
          <h1 className="text-lg font-semibold">{t('appName')}</h1>
        </header>
        <main className="flex-1 p-4 sm:p-6">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
