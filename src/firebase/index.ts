'use client';

import { firebaseConfig } from '@/firebase/config';
import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { initializeAuth, indexedDBLocalPersistence, inMemoryPersistence } from 'firebase/auth';
import { initializeFirestore } from 'firebase/firestore'
import { getStorage } from 'firebase/storage';

// IMPORTANT: DO NOT MODIFY THIS FUNCTION
export function initializeFirebase() {
  if (!getApps().length) {
    const firebaseApp = initializeApp(firebaseConfig);
    return getSdks(firebaseApp);
  }

  // If already initialized, return the SDKs with the already initialized App
  return getSdks(getApp());
}

export function getSdks(firebaseApp: FirebaseApp) {
  const isClient = typeof window !== 'undefined';

  return {
    firebaseApp,
    auth: initializeAuth(firebaseApp, {
      // Use indexedDB for persistence on the client, or in-memory (no-op on server) for server-side rendering
      persistence: isClient ? indexedDBLocalPersistence : inMemoryPersistence
    }),
    // Pass client-side specific settings only in the browser environment
    // For server-side, pass an empty object to avoid initialization errors.
    firestore: initializeFirestore(
      firebaseApp,
      isClient ? { experimentalAutoDetectLongPolling: true } : {}
    ),
    storage: getStorage(firebaseApp)
  };
}

export * from './provider';
export * from './client-provider';
export * from './firestore/use-collection';
export * from './firestore/use-doc';
export * from './non-blocking-updates';
export * from './errors';
export * from './error-emitter';
