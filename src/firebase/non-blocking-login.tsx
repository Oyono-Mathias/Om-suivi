'use client';
import {
  Auth, // Import Auth type for type hinting
  signInWithPopup,
  GoogleAuthProvider,
} from 'firebase/auth';
import { FirebaseError } from 'firebase/app';

/** Initiate Google sign-in (non-blocking). */
export function initiateGoogleSignIn(authInstance: Auth, onError?: (error: FirebaseError) => void): void {
  const provider = new GoogleAuthProvider();
  // CRITICAL: Call signInWithPopup directly. Do NOT use 'await'.
  signInWithPopup(authInstance, provider)
    .catch((error: any) => {
        if (onError && error instanceof FirebaseError) {
            onError(error);
        } else {
            console.error("Google Sign-In Error:", error);
        }
    });
  // Code continues immediately. Auth state change is handled by onAuthStateChanged listener.
}
