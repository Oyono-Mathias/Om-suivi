'use client';

import React, { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { initiateGoogleSignIn, useAuth, useUser } from '@/firebase';
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
  
  const handleGoogleSignIn = () => {
    initiateGoogleSignIn(auth);
  };

  const GoogleIcon = (props: React.SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 488 512" {...props}>
      <path
        fill="currentColor"
        d="M488 261.8C488 403.3 381.5 512 244 512 111.8 512 0 400.2 0 261.8 0 123.4 111.8 12.3 244 12.3c69.1 0 128.8 28.3 172.4 72.3l-66.2 63.8C324.7 114.3 287.2 96.5 244 96.5c-88.6 0-160.2 71.9-160.2 160.3s71.6 160.3 160.2 160.3c100.3 0 137.9-69.3 141.8-106.3H244v-85.3h236.1c2.3 12.7 3.9 26.9 3.9 41.4z"
      />
    </svg>
  );

  return (
    <div className="flex h-screen w-full items-center justify-center bg-background">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold">Welcome to OM Suivi</CardTitle>
          <CardDescription>Sign in to track your time and overtime.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <Button onClick={handleGoogleSignIn} variant="outline" className="w-full">
              <GoogleIcon className="mr-2 h-4 w-4" />
              Sign In with Google
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
