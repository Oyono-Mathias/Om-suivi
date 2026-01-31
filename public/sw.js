// This is a basic service worker file.

// On install, activate immediately.
self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

// On activation, take control of all clients.
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Listen for push notifications from the server.
self.addEventListener('push', (event) => {
  if (!event.data) {
    console.error('Push event but no data');
    return;
  }
  
  const data = event.data.json();
  const title = data.title || 'OM Suivi';
  const options = {
    body: data.body,
    icon: '/icons/icon-192x192.png', // Main icon
    badge: '/icons/icon-96x96.png', // Smaller icon for the notification bar
    data: {
        url: data.url || '/' // URL to open on click
    }
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// Handle notification click
self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    
    const urlToOpen = event.notification.data.url || '/';

    event.waitUntil(
        clients.matchAll({
            type: 'window',
            includeUncontrolled: true
        }).then((clientList) => {
            if (clientList.length > 0) {
                let client = clientList[0];
                for (let i = 0; i < clientList.length; i++) {
                    if (clientList[i].focused) {
                        client = clientList[i];
                    }
                }
                return client.focus();
            }
            return clients.openWindow(urlToOpen);
        })
    );
});
