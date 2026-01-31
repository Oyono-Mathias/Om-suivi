// Scripts for firebase and firebase messaging
// NOTE: You can only use Firebase Messaging here, other Firebase libraries
// are not available in the service worker.
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');

// Initialize the Firebase app in the service worker by passing in
// your app's Firebase config object.
// https://firebase.google.com/docs/web/setup#config-object
const firebaseConfig = {
  "projectId": "studio-3929362902-1f7dc",
  "appId": "1:777892671254:web:08d8a34851c7a749b3aa37",
  "apiKey": "AIzaSyClosHZ730ak_5a0Y0nlV7aU9TXqWANoO0",
  "authDomain": "studio-3929362902-1f7dc.firebaseapp.com",
  "storageBucket": "studio-3929362902-1f7dc.appspot.com",
  "measurementId": "",
  "messagingSenderId": "777892671254"
};

firebase.initializeApp(firebaseConfig);

// Retrieve an instance of Firebase Messaging so that it can handle background
// messages.
const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  console.log(
    '[firebase-messaging-sw.js] Received background message ',
    payload
  );
  
  // Customize notification here
  const notificationTitle = payload.notification.title;
  const notificationOptions = {
    body: payload.notification.body,
    icon: '/logo-omsuivi.png' // Make sure you have this icon in /public
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});
