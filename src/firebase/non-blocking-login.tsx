'use client';
import {
  Auth, // Import Auth type for type hinting
  signInWithPopup,
  GoogleAuthProvider,
} from 'firebase/auth';

/** Initiate Google sign-in (non-blocking). */
export function initiateGoogleSignIn(authInstance: Auth): void {
  const provider = new GoogleAuthProvider();
  // CRITICAL: Call signInWithPopup directly. Do NOT use 'await'.
  signInWithPopup(authInstance, provider);
  // Code continues immediately. Auth state change is handled by onAuthStateChanged listener.
}
