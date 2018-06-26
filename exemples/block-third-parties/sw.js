// Load howslow
self.importScripts('howSlowForSW.js');

// Returning true will block the resource with the HTTP code "446 Blocked by Service Worker"
function urlBlockingHook(url) {
    return (url === 'https://thirdparty.com/tracker.js' && howslow.getBandwidth() < 50);
}