'use client';

import { getMessaging, getToken, onMessage } from 'firebase/messaging';
import { getApp } from 'firebase/app';
import { doc, setDoc, Firestore } from 'firebase/firestore';

// ====================================================================================
//  ATTENTION: ACTION REQUISE
// ====================================================================================
//  Vous devez remplacer la valeur de VAPID_KEY ci-dessous par votre propre clé
//  générée depuis la console Firebase.
//
//  1. Allez sur la console Firebase de votre projet.
//  2. Allez dans "Project Settings" (Paramètres du projet) > "Cloud Messaging".
//  3. Dans la section "Web configuration", cliquez sur "Generate key pair" (Générer une paire de clés).
//  4. Copiez la clé publique et collez-la ici.
// ====================================================================================
const VAPID_KEY = 'BOOp-bRY1VT8ilFhAVeUlfdyamulhYah7Uyb6bE6KVTVo7I42L0IDFCnESnxOg3Z7rrklMLu2zNCr3pHCU8AiOI';

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
  if (VAPID_KEY === 'YOUR_VAPID_KEY_HERE') {
    console.error(
      "================================\n" +
      "ATTENTION: Clé VAPID manquante.\n" +
      "Veuillez mettre à jour la constante VAPID_KEY dans src/lib/firebase-messaging.ts.\n" +
      "Les notifications ne fonctionneront pas sans cette clé.\n" +
      "================================"
    );
    return;
  }
  
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
    if ((err as Error).message.includes('permission-denied') || (err as Error).message.includes('MISSING_VAPID_KEY') || (err as Error).message.includes('applicationServerKey')) {
         console.error("Could not get FCM token. Please ensure you have granted notification permissions and configured your VAPID key in src/lib/firebase-messaging.ts");
    }
  }
};
