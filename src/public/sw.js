importScripts("../epoxy/index.js");
importScripts("/uv/uv.bundle.js");
importScripts("/uv/uv.config.js");
importScripts(__uv$config.sw || "uv.sw.js");

const uv = new UVServiceWorker();
let isAdBlockEnabled = true;
let blocklistCache = null;

const dbPromise = indexedDB.open('AdBlockSettings', 1);

dbPromise.onupgradeneeded = (event) => {
  const db = event.target.result;
  db.createObjectStore('settings', { keyPath: 'name' });
};

dbPromise.onsuccess = (event) => {
  const db = event.target.result;
  const transaction = db.transaction(['settings'], 'readonly');
  const objectStore = transaction.objectStore('settings');
  const request = objectStore.get('adBlockEnabled');

  request.onsuccess = (event) => {
    if (event.target.result) {
      isAdBlockEnabled = event.target.result.value;
    }
  };
};

async function getBlocklist() {
  const response = await fetch('/list.txt');
  const text = await response.text();
  return text.split('\n').filter(line => line.trim() !== '');
}

function domainMatches(domain, pattern) {
  if (pattern.startsWith('*.')) {
    const patternDomain = pattern.slice(2);
    return domain === patternDomain || domain.endsWith('.' + patternDomain);
  }
  return domain === pattern;
}

function extractRootDomain(url) {
  try {
    const { hostname } = new URL(url);
    return hostname.split('.').slice(-2).join('.');
  } catch (error) {
    console.error('Invalid URL:', url);
    return null;
  }
}

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'TOGGLE_AD_BLOCK') {
    isAdBlockEnabled = event.data.enabled;
    
    const db = dbPromise.result;
    const transaction = db.transaction(['settings'], 'readwrite');
    const objectStore = transaction.objectStore('settings');
    objectStore.put({ name: 'adBlockEnabled', value: isAdBlockEnabled });
  }
});

self.addEventListener("fetch", (event) => {
  event.respondWith(
    (async () => {
      if (uv.route(event)) {
        console.log(event)
        const currentUrl = event.request.url;
        const decoded = __uv$config.decodeUrl(decodeURIComponent(currentUrl.split(__uv$config.prefix).pop()));
        
        if (isAdBlockEnabled) {
          const rootDomain = extractRootDomain(decoded);
          if (rootDomain) {
            if (!blocklistCache) {
              blocklistCache = await getBlocklist();
            }
            for (const pattern of blocklistCache) {
              if (domainMatches(rootDomain, pattern)) {
                console.log('Ad detected:', decoded);
                return new Response('Ad blocked', { status: 403 });
              }
            }
          }
        }
        
        return await uv.fetch(event);
      }
      return await fetch(event.request);
    })()
  );
});
