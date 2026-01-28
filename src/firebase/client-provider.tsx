'use client';

import { ReactNode, useMemo } from 'react';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

import { firebaseConfig } from './config';
import { FirebaseProvider } from './provider';

export function FirebaseClientProvider({ children }: { children: ReactNode }) {
  const firebase = useMemo(() => {
    // A quick check to ensure the placeholder API key is replaced.
    // This will prevent the app from crashing.
    if (firebaseConfig.apiKey.includes('YOUR_KEY_IS_INCOMPLETE')) {
      console.error('Firebase API key is incomplete. Please update src/firebase/config.ts');
      return { app: null, auth: null, firestore: null };
    }
    const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
    const auth = getAuth(app);
    const firestore = getFirestore(app);
    return { app, auth, firestore };
  }, []);

  return <FirebaseProvider value={firebase}>{children}</FirebaseProvider>;
}
