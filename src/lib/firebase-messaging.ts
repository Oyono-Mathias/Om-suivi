'use client';

import { getMessaging, getToken, onMessage } from 'firebase/messaging';
import { getApp } from 'firebase/app';
import { doc, setDoc, Firestore } from 'firebase/firestore';

// CRITICAL: This key MUST be replaced with your actual VAPID key from the Firebase Console.
// Go to Project Settings > Cloud Messaging > Web configuration and generate a key pair.
const VAPID_KEY = 'YOUR_VAPID_KEY_HERE'; // <-- PASTE YOUR VAPID KEY HERE

export const requestNotificationPermission = async (userId: string, firestore: Firestore) => {
  if (typeof window === 'undefined' || !('Notification' in window) || !navigator.serviceWorker) {
    console.log('This browser does not support notifications or service workers.');
    return;
  }

  try {
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      console.log('Notification permission granted.');
      await saveMessagingDeviceToken(userId, firestore);
    } else {
      console.log('Unable to get permission to notify.');
    }
  } catch (error) {
    console.error('Error requesting notification permission:', error);
  }
};

const saveMessagingDeviceToken = async (userId: string, firestore: Firestore) => {
  try {
    const app = getApp();
    const messaging = getMessaging(app);

    // Wait for the Service Worker to be ready.
    const registration = await navigator.serviceWorker.ready;
    const fcmToken = await getToken(messaging, { vapidKey: VAPID_KEY, serviceWorkerRegistration: registration });

    if (fcmToken) {
      console.log('FCM Token:', fcmToken);
      const userProfileRef = doc(firestore, 'users', userId);
      await setDoc(userProfileRef, { fcmToken }, { merge: true });

      // Listen for foreground messages
      onMessage(messaging, (payload) => {
        console.log('Foreground message received.', payload);
        // Here you could display an in-app toast or banner
        // For example:
        // toast({ title: payload.notification?.title, description: payload.notification?.body });
      });
    } else {
      console.log('No registration token available. Request permission to generate one.');
    }
  } catch (err) {
    console.error('An error occurred while retrieving token. ', err);
    // This often happens if the VAPID key is missing or incorrect.
    if ((err as Error).message.includes('permission-denied') || (err as Error).message.includes('MISSING_VAPID_KEY')) {
         console.error("Could not get FCM token. Please ensure you have granted notification permissions and configured your VAPID key in src/lib/firebase-messaging.ts");
    }
  }
};
