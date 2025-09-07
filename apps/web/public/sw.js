const CACHE_NAME = 'sofi-v1'
const STATIC_CACHE_URLS = [
  '/',
  '/dashboard',
  '/calendar',
  '/insights',
  '/profile',
  '/login',
  '/offline',
  '/manifest.json'
]

const API_CACHE_URLS = [
  '/api/ai/vision',
  '/api/ai/speech',
  '/api/ai/insights'
]

// Install event - cache static assets
self.addEventListener('install', (event) => {
  console.log('Service Worker: Installing...')
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Service Worker: Caching static assets')
        return cache.addAll(STATIC_CACHE_URLS)
      })
      .then(() => {
        console.log('Service Worker: Static assets cached')
        return self.skipWaiting()
      })
      .catch((error) => {
        console.error('Service Worker: Failed to cache static assets', error)
      })
  )
})

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('Service Worker: Activating...')
  
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheName !== CACHE_NAME) {
              console.log('Service Worker: Deleting old cache:', cacheName)
              return caches.delete(cacheName)
            }
          })
        )
      })
      .then(() => {
        console.log('Service Worker: Claiming clients')
        return self.clients.claim()
      })
      .catch((error) => {
        console.error('Service Worker: Activation failed', error)
      })
  )
})

// Fetch event - handle requests with cache strategies
self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  // Skip non-GET requests
  if (request.method !== 'GET') {
    return
  }

  // Skip chrome-extension and other non-http requests
  if (!url.protocol.startsWith('http')) {
    return
  }

  // Handle different types of requests with appropriate strategies
  if (url.pathname.startsWith('/api/')) {
    // API requests - Network First with cache fallback
    event.respondWith(networkFirstStrategy(request))
  } else if (STATIC_CACHE_URLS.includes(url.pathname)) {
    // Static pages - Cache First with network fallback
    event.respondWith(cacheFirstStrategy(request))
  } else if (url.pathname.match(/\.(js|css|png|jpg|jpeg|gif|svg|ico|woff|woff2)$/)) {
    // Static assets - Cache First
    event.respondWith(cacheFirstStrategy(request))
  } else {
    // Other requests - Network First with offline fallback
    event.respondWith(networkFirstWithOfflineFallback(request))
  }
})

// Network First Strategy (good for API calls)
async function networkFirstStrategy(request) {
  try {
    const networkResponse = await fetch(request)
    
    // Cache successful responses
    if (networkResponse.ok) {
      const cache = await caches.open(CACHE_NAME)
      cache.put(request, networkResponse.clone())
    }
    
    return networkResponse
  } catch (error) {
    console.log('Network request failed, trying cache:', error)
    const cachedResponse = await caches.match(request)
    
    if (cachedResponse) {
      return cachedResponse
    }
    
    // Return a custom offline response for API calls
    return new Response(
      JSON.stringify({ 
        error: 'Offline - please try again when connected',
        offline: true 
      }),
      {
        status: 503,
        statusText: 'Service Unavailable',
        headers: { 'Content-Type': 'application/json' }
      }
    )
  }
}

// Cache First Strategy (good for static assets)
async function cacheFirstStrategy(request) {
  const cachedResponse = await caches.match(request)
  
  if (cachedResponse) {
    // Update cache in background
    fetch(request)
      .then((networkResponse) => {
        if (networkResponse.ok) {
          caches.open(CACHE_NAME)
            .then((cache) => cache.put(request, networkResponse))
        }
      })
      .catch(() => {}) // Ignore network errors in background update
    
    return cachedResponse
  }
  
  try {
    const networkResponse = await fetch(request)
    
    if (networkResponse.ok) {
      const cache = await caches.open(CACHE_NAME)
      cache.put(request, networkResponse.clone())
    }
    
    return networkResponse
  } catch (error) {
    console.log('Failed to fetch resource:', error)
    
    // Return a generic offline response
    return new Response('Offline', {
      status: 503,
      statusText: 'Service Unavailable'
    })
  }
}

// Network First with Offline Fallback (good for pages)
async function networkFirstWithOfflineFallback(request) {
  try {
    const networkResponse = await fetch(request)
    
    if (networkResponse.ok) {
      const cache = await caches.open(CACHE_NAME)
      cache.put(request, networkResponse.clone())
    }
    
    return networkResponse
  } catch (error) {
    console.log('Network request failed, trying cache:', error)
    const cachedResponse = await caches.match(request)
    
    if (cachedResponse) {
      return cachedResponse
    }
    
    // Return offline page
    const offlineResponse = await caches.match('/offline')
    if (offlineResponse) {
      return offlineResponse
    }
    
    // Fallback offline response
    return new Response(
      `<!DOCTYPE html>
      <html>
        <head>
          <title>Offline - Sofi</title>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <style>
            body { font-family: system-ui; text-align: center; padding: 2rem; }
            .offline { color: #666; }
          </style>
        </head>
        <body>
          <h1>You're Offline</h1>
          <p class="offline">Please check your internet connection and try again.</p>
          <button onclick="location.reload()">Retry</button>
        </body>
      </html>`,
      {
        status: 503,
        statusText: 'Service Unavailable',
        headers: { 'Content-Type': 'text/html' }
      }
    )
  }
}

// Background Sync for failed requests
self.addEventListener('sync', (event) => {
  console.log('Service Worker: Background sync triggered:', event.tag)
  
  if (event.tag === 'background-sync-mood') {
    event.waitUntil(syncMoodEntries())
  } else if (event.tag === 'background-sync-food') {
    event.waitUntil(syncFoodEntries())
  }
})

// Sync mood entries when back online
async function syncMoodEntries() {
  try {
    // Get pending mood entries from IndexedDB
    const pendingEntries = await getPendingMoodEntries()
    
    for (const entry of pendingEntries) {
      try {
        const response = await fetch('/api/mood-entries', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(entry)
        })
        
        if (response.ok) {
          await removePendingMoodEntry(entry.id)
          console.log('Synced mood entry:', entry.id)
        }
      } catch (error) {
        console.error('Failed to sync mood entry:', error)
      }
    }
  } catch (error) {
    console.error('Background sync failed:', error)
  }
}

// Sync food entries when back online
async function syncFoodEntries() {
  try {
    // Get pending food entries from IndexedDB
    const pendingEntries = await getPendingFoodEntries()
    
    for (const entry of pendingEntries) {
      try {
        const response = await fetch('/api/food-entries', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(entry)
        })
        
        if (response.ok) {
          await removePendingFoodEntry(entry.id)
          console.log('Synced food entry:', entry.id)
        }
      } catch (error) {
        console.error('Failed to sync food entry:', error)
      }
    }
  } catch (error) {
    console.error('Background sync failed:', error)
  }
}

// IndexedDB helpers (placeholder implementations)
async function getPendingMoodEntries() {
  // TODO: Implement IndexedDB operations
  return []
}

async function removePendingMoodEntry(id) {
  // TODO: Implement IndexedDB operations
  console.log('Remove pending mood entry:', id)
}

async function getPendingFoodEntries() {
  // TODO: Implement IndexedDB operations
  return []
}

async function removePendingFoodEntry(id) {
  // TODO: Implement IndexedDB operations
  console.log('Remove pending food entry:', id)
}

// Push notification event
self.addEventListener('push', (event) => {
  console.log('Service Worker: Push notification received')
  
  const options = {
    body: 'Time to track your mood and food!',
    icon: '/icons/icon-192x192.png',
    badge: '/icons/badge-72x72.png',
    vibrate: [100, 50, 100],
    data: {
      dateOfArrival: Date.now(),
      primaryKey: 1
    },
    actions: [
      {
        action: 'track-mood',
        title: 'Track Mood',
        icon: '/icons/mood-action.png'
      },
      {
        action: 'log-food',
        title: 'Log Food',
        icon: '/icons/food-action.png'
      }
    ]
  }
  
  event.waitUntil(
    self.registration.showNotification('Sofi Reminder', options)
  )
})

// Notification click event
self.addEventListener('notificationclick', (event) => {
  console.log('Service Worker: Notification clicked:', event.action)
  
  event.notification.close()
  
  let url = '/'
  
  switch (event.action) {
    case 'track-mood':
      url = '/dashboard?action=mood'
      break
    case 'log-food':
      url = '/dashboard?action=food'
      break
    default:
      url = '/dashboard'
  }
  
  event.waitUntil(
    clients.matchAll({ type: 'window' })
      .then((clientList) => {
        // Check if app is already open
        for (const client of clientList) {
          if (client.url === url && 'focus' in client) {
            return client.focus()
          }
        }
        
        // Open new window if app is not open
        if (clients.openWindow) {
          return clients.openWindow(url)
        }
      })
  )
})