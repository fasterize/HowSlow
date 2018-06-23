class HowSlowForPage {
    
    constructor(swPath) {
        this.bandwidth = null;
        this.rtt = null;

        this.initSW(swPath)
            .then(() => this.listenToSW())
            .catch((error) => console.log('[HowSlow]' + error));

        this.firstRequestSent = false;
        this.navigationStart = 0;
    }

    getBandwidth() {
        return this.bandwidth;
    }

    getRTT() {
        return this.rtt;
    }

    // Initializes the Service Worker, or at least tries
    initSW(swPath) {
        return new Promise((resolve, reject) => {
            if (!('serviceWorker' in window.navigator)) {
                // No browser support
                reject('Service Workers not supported');
            }

            if (window.navigator.serviceWorker.controller) {
                if (window.navigator.serviceWorker.controller.scriptURL.indexOf(swPath) >= 0) {
                    // The service worker is already active
                    resolve();
                } else {
                    reject('Giving up. Service Worker conflict with: ' + window.navigator.serviceWorker.controller.scriptURL);
                }
            } else {
                window.navigator.serviceWorker.register(swPath)
                    .then(window.navigator.serviceWorker.ready)
                    .then(function(serviceWorkerRegistration) {
                        // The service worker is registered and should even be ready now
                        resolve();
                });
            }
        });
    }

    // Geting ready to receive messages from the Service Worker
    listenToSW() {
        window.navigator.serviceWorker.onmessage = (event) => {
            if (event.data.command === 'timingsPlz') {                
                // The Service Workers asks for resource timings
                const timings = this.readLatestResourceTimings();
                
                if (timings.length > 0) {
                    this.sendResourceTimings(timings);
                }
            } else if (event.data.command === 'stats') {
                // The Service Workers sends the latest stats
                this.bandwidth = event.data.bandwidth;
                this.rtt = event.data.rtt;
            }
        };
    }

    // Gathers the latest ResourceTimings and sends them to SW
    sendResourceTimings(simplifiedTimings) {
        try {
            navigator.serviceWorker.controller.postMessage({
                'command': 'eatThat',
                'timings': simplifiedTimings
            });
        } catch(error) {}
    }

    // Gathers the ResourceTimings from the API
    readLatestResourceTimings() {
        
        // Not compatible browsers
        if (!window.performance || !window.performance.getEntriesByType || !window.performance.timing) {
            return [];
        }

        let timings = [];

        if (!this.firstRequestSent) {

            // Save this for later
            this.navigationStart = window.performance.timing.navigationStart;
            
            // The first HTML resource is as intersting as the others... maybe even more!
            timings.push({
                name: window.location.href,
                transferSize: window.performance.timing.transferSize,
                domainLookupStart: window.performance.timing.domainLookupStart,
                domainLookupEnd: window.performance.timing.domainLookupEnd,
                connectStart: window.performance.timing.connectStart,
                connectEnd: window.performance.timing.connectEnd,
                requestStart: window.performance.timing.requestStart,
                responseStart: window.performance.timing.responseStart,
                responseEnd: window.performance.timing.responseEnd
            });

            this.firstRequestSent = true;
        }

        window.performance.getEntriesByType('resource').forEach((timing) => {
            timings.push({
                name: timing.name,
                transferSize: timing.transferSize,
                domainLookupStart: Math.round(this.navigationStart + timing.domainLookupStart),
                domainLookupEnd: Math.round(this.navigationStart + timing.domainLookupEnd),
                connectStart: Math.round(this.navigationStart + timing.connectStart),
                connectEnd: Math.round(this.navigationStart + timing.connectEnd),
                secureConnectionStart: Math.round(this.navigationStart + timing.secureConnectionStart),
                requestStart: Math.round(this.navigationStart + timing.requestStart),
                responseStart: Math.round(this.navigationStart + timing.responseStart),
                responseEnd: Math.round(this.navigationStart + timing.responseEnd)
            });
        });

        // Now lets clear resourceTimings
        window.performance.clearResourceTimings();
        window.performance.setResourceTimingBufferSize(200);
        
        // TODO: add an option to avoid clearing ResourceTimings...
        // ... some other scripts might need them!

        return timings;
    }
}