'use client';

import { useEffect } from 'react';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';

/**
 * Reports Firestore permission failures without crashing the entire application.
 *
 * Individual Firestore hooks already expose their error through their return
 * value. A permission denial must therefore remain a recoverable data error,
 * not be re-thrown during React rendering as an uncaught client exception.
 */
export function FirebaseErrorListener() {
  useEffect(() => {
    const handleError = (error: FirestorePermissionError) => {
      console.error('[Firestore permission error]', error.message);
    };

    errorEmitter.on('permission-error', handleError);

    return () => {
      errorEmitter.off('permission-error', handleError);
    };
  }, []);

  return null;
}
