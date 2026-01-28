'use client';

import React, { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { initiateAnonymousSignIn, useAuth, useUser } from '@/firebase';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';

export default function LoginPage() {
  const auth = useAuth();
  const { user, isUserLoading } = useUser();
  const router = useRouter();

  useEffect(() => {
    if (user) {
      router.replace('/');
    }
  }, [user, router]);

  if (isUserLoading || user) {
    return (
      <div className="flex h-screen w-full items-center justify-center">
        <Loader2 className="h-10 w-10 animate-spin" />
        {user && <p className="ml-2">Redirecting...</p>}
      </div>
    );
  }
  
  const handleAnonymousSignIn = () => {
    initiateAnonymousSignIn(auth);
  };

  return (
    <div className="flex h-screen w-full items-center justify-center bg-background">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold">Welcome to OM Suivi</CardTitle>
          <CardDescription>Sign in to track your time and overtime.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* We will add email/password later */}
            <Button onClick={handleAnonymousSignIn} className="w-full">
              Sign In Anonymously
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
