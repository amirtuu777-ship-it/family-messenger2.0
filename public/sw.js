// Service Worker для Push уведомлений

self.addEventListener('push', (event) => {
    const data = event.data ? event.data.json() : {};
    
    const options = {
        body: data.body || 'Входящий звонок...',
        icon: '/icon-192.png',
        vibrate: [200, 100, 200],
        tag: 'incoming-call',
        renotify: true,
        requireInteraction: true,
        actions: [
            { action: 'accept', title: '📞 Принять' },
            { action: 'decline', title: '❌ Отклонить' }
        ],
        data: {
            callerId: data.callerId,
            callerName: data.callerName
        }
    };
    
    event.waitUntil(
        self.registration.showNotification(data.title || 'SharIQ', options)
    );
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const data = event.notification.data;
    
    if (event.action === 'accept') {
        clients.openWindow(`/?caller=${data.callerId}&action=accept`);
    } else if (event.action === 'decline') {
        clients.openWindow(`/?caller=${data.callerId}&action=decline`);
    } else {
        clients.openWindow('/');
    }
    
    event.waitUntil(Promise.resolve());
});

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(clients.claim()));
