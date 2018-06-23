

/* ----- ↑ Write your own service workers rules above this line ↑ ----- */
/* ----- ↓ Change below this line at your own risks ↓ -------------------------------- */

// Service Worker initialization
self.addEventListener('install', () => {
    self.skipWaiting(); // Activate worker immediately
});

self.addEventListener('activate', () => {
    if (self.clients && self.clients.claim) {
        // Make it available immediately
        self.clients.claim().then(() => {
            // The service worker is ready to work

            // The attached pages might already have some resource timings available.
            // Let's ask!
            howslow.askTimingsToClients();
        });
    }
});

// Intercept requests
self.addEventListener('fetch', (event) => {
    
    if (typeof urlBlockingHook === 'function' && urlBlockingHook(event.request.url) === true) {
        event.respondWith(new Response('', {
            status: 446,
            statusText: 'Blocked by Service Worker'
        }));
        return;
    }

    let modifiedUrl = (typeof urlRewritingHook === 'function') ? urlRewritingHook(event.request.url) : null;
    let options = {};

    if (modifiedUrl) {
        // Add credentials to the request otherwise the fetch method opens a new connection
        options.credentials = 'include';
    }

    event.respondWith(
        fetch((modifiedUrl || event.request), options)
            .then(function(response) {
                // Save the content-length header
                howslow.addContentLength(response.url, response);
                return response;
            })
    );
});


class HowSlowForSW {
    
    constructor() {
        this.allTimings = [];
        this.allContentLengths = [];
        this.allIntervals = [];
        this.INTERVAL_DURATION = 25; // in milliseconds

        // That's our supposed service worker initialization time
        // TODO: replace by the reference time used inside the SW's Resource Timings
        // (I have no idea how to find it)
        this.epoch = Date.now();

        // Start the ticker
        this.tick();

        // Listen to the broadcast responses
        self.addEventListener('message', (event) => {
            if (event.data.command === 'eatThat') {
                // Some new timings just arrived from a page
                event.data.timings.forEach((timing) => {
                    this.addOneTiming(timing)
                });
            }
        });

        this.initDatabase();
    }

    // Every second:
    tick() {
        // Do that...
        this.refreshStats();
        this.sendStatsToClients();

        // ... and repeat
        setTimeout(() => {
            this.tick();
        }, 1000);
    }

    getBandwidth() {
        if (this.bandwidth) {
            return this.bandwidth;
        }

        // If we couldn't estimate bandwidth yet, but we've got a record in database
        // We serve the saved bandwidth
        if (!this.connectionTypeFromDatabase
            || !self.navigator.connection
            || !self.navigator.connection.type
            || this.connectionTypeFromDatabase === self.navigator.connection.type) {

            return this.bandwidthFromDatabase;
        }

        return undefined;
    }

    getRTT() {
        if (this.rtt) {
            return this.rtt;
        }

        // If we couldn't estimate bandwidth yet, but we've got a record in database
        // We serve the saved bandwidth
        if (!this.connectionTypeFromDatabase
            || !self.navigator.connection
            || !self.navigator.connection.type
            || this.connectionTypeFromDatabase === self.navigator.connection.type) {

            return this.rttFromDatabase;
        }

        return undefined;
    }

    // Updates bandwidth & rtt
    refreshStats() {
        
        // Update the data from resource timings
        this.refreshTimings();
        
        // Use the data to estimate bandwidth
        this.bandwidth = this.estimateBandwidth();
        this.rtt = this.estimateRTT();
        
        // If the bandwith or the RTT were correctly estimated,
        // we save them to database and send them as a message to clients
        if (this.bandwidth || this.rtt) {
            this.saveStats();
        }
    }

    // Collects the latest resource timings
    refreshTimings() {

        if (self.performance && self.performance.getEntriesByType) {
            // If the Service Worker has access to the Resource Timing API,
            // It's easy, we just read it.

            self.performance.getEntriesByType('resource').forEach((timing) => {
                this.addOneTiming(this.simplifyTimingObject(timing));
            });
            
            // Then we empty the history
            self.performance.clearResourceTimings();
            
            // "The clearResourceTimings() method removes all performance entries [...] and sets 
            //  the size of the performance data buffer to zero. To set the size of the browser's 
            //  performance data buffer, use the Performance.setResourceTimingBufferSize() method."
            self.performance.setResourceTimingBufferSize(200);
        }

        // TODO : the "else" part, when the Service Workers doesn't have access to
        // the Resource Timing API (Microsoft Edge)
    }

    // Sends a request to all clients for their resource timings.
    askTimingsToClients() {
        this.sendMessageToAllClients({
            command: 'timingsPlz'
        });
    }

    // Send bandwidth and RTT to all clients
    sendStatsToClients() {
        this.sendMessageToAllClients({
            command: 'stats',
            bandwidth: this.getBandwidth(),
            rtt: this.getRTT()
        });
    }

    // Sends a message to all clients
    sendMessageToAllClients(json) {
        self.clients.matchAll()
            .then((clients) => {
                clients.forEach((client) => {
                    client.postMessage(json);
                });
            });
    }

    // Saves one timing in the allTimings list
    // only if it doesn't look like it comes from the browser's cache
    addOneTiming(timing) {

        // If we don't have the transfer size (Safari & Edge don't provide it)
        // than let's try to read it from the Content-Length headers.
        if (!timing.transferSize) {
            timing.transferSize = this.findContentLength(timing.name);
        }

        const time = timing.responseEnd - timing.responseStart;

        // If the transfer is ridiculously fast (> 200Mbps), then it most probably comes
        // from browser cache and timing is not reliable.
        if (time > 0 && timing.transferSize > 0 && timing.transferSize / time < 26214) {
            this.allTimings.push(timing);
            this.splitTimingIntoIntervals(timing);
        }
    }

    // To be able to estimate the bandwidth, we split this resource transferSize into
    // time intervals and add them to our timeline.
    splitTimingIntoIntervals(timing) {
        let startingBlock = Math.floor((timing.responseStart - this.epoch) / this.INTERVAL_DURATION);
        let endingBlock = Math.floor((timing.responseEnd - this.epoch) / this.INTERVAL_DURATION);
        let bytesPerBlock = timing.transferSize / ((endingBlock - startingBlock + 1));

        for (var i = startingBlock; i <= endingBlock; i++) {
            this.allIntervals[i] = (this.allIntervals[i] || 0) + bytesPerBlock;
        }
    }
    
    // What a good idea we had, to save the Content-Length headers!
    // Because we need one.
    findContentLength(url) {
        for (var i = this.allContentLengths.length - 1; i >= 0; i--) {
            if (this.allContentLengths[i].url === url) {
                return parseInt(this.allContentLengths[i].size, 10);
            }
        }
    }

    // Saves the content-length data from a fetched response header
    addContentLength(url, response) {
        if (response.type !== 'opaque' && response.headers.has('content-length')) {
            this.allContentLengths.push({
                url: url,
                size: response.headers.get('content-length')
            });
        }
    }

    // Reads timings and estimates bandwidth
    estimateBandwidth() {
        
        // Let's estimate the bandwidth for some different periods of times (in seconds)
        const ages = [20, 60, 300, 86400]; // 20s, 1m, 5m, 1d
        const bandwidths = ages.map((bw) => this.estimateBandwidthForAPeriod(bw));
        
        let result = this.averageWithWeight(bandwidths);
        
        // Always cap bandwidth with the theorical max speed of underlying network
        // (when the Network Information API is available, of course)
        // It makes the library more reactive when, for exemple, the user
        // sudenly looses its 3G signal and gets 2G instead.
        result = Math.min(result, this.getDownlinkMax());

        return Math.round(result);
    }

    // Estimates bandwidth for the last given number of seconds
    estimateBandwidthForAPeriod(numberOfSeconds) {
        
        // Now, minus the number of minutes
        const from = Date.now() - this.epoch - (numberOfSeconds * 1000);

        // Retrieves corresponding cells in the timeline array
        const newArray = this.allIntervals.slice(from / this.INTERVAL_DURATION);
        
        if (newArray.length === 0) {
            return undefined;
        }

        // Sums up the transfered size in this duration
        const transferedSize = newArray.reduce((a, b) => a + b);
        
        // Skip estimating bandwidth if too few kilobytes were collected
        if (transferedSize < 51200) {
            return undefined;
        }

        // Now let's use the 90th percentile of all values
        // From my different tests, that percentile provides good results
        const nineteenthPercentile = this.percentile(newArray, .9);

        // Convert bytes per (this.INTERVAL_DURATION)ms to kilobytes per second (kilobytes, not kilobits!)
        const mbps = nineteenthPercentile * 1000 / this.INTERVAL_DURATION / 1024;

        return mbps;
    }

    // Reads timings and estimates Round Trip Time
    estimateRTT() {
        // Same as for bandwidth, we start by estimating the RTT on several periods of time
        const ages = [20, 60, 300, 86400]; // 20s, 1m, 5m, 1d
        const rtts = ages.map((bw) => this.estimateRTTForAPeriod(bw));
        
        return Math.round(this.averageWithWeight(rtts));
    }

    // Estimates RTT for the last given number of seconds
    estimateRTTForAPeriod(numberOfSeconds) {
        
        // Now, minus the number of minutes
        const from = Date.now() - (numberOfSeconds * 1000);

        let pings = this.allTimings.filter(timing => {
            return timing.responseEnd >= from;
        }).map(timing => {
            // The estimated RTT for one request is an average of: 
            // DNS lookup time + First connection + SSL handshake + Time to First Byte
            // in milliseconds.
            //
            // Note: we can't rely on timing.secureConnectionStart because IE doesn't provide it.
            // But we're always on HTTPS, so let's just count TCP connection as two roundtrips.
            //
            const dns = timing.domainLookupEnd - timing.domainLookupStart;
            const tcp = timing.connectEnd - timing.connectStart;
            const ttfb = timing.responseStart - timing.requestStart;
            
            // Let's consider that any timing under 10ms is not valuable
            const roundtripsCount = (dns > 10) + ((tcp > 10) * 2) + (ttfb > 10);
            return roundtripsCount ? Math.round((dns + tcp + ttfb) / roundtripsCount) : null;
        });

        // Skip estimating RTT if too few requests were analyzed
        if (pings.length < 3) {
            return undefined;
        }

        // Let's use the 20th percentile here, to eliminate servers' slowness
        return this.percentile(pings, .2);
    }

    // Returns the value at a given percentile in a numeric array.
    // Not very accurate, but accurate enough for our needs.
    percentile(arr, p) {

        // Remove undefineds and transfer to a new array
        let newArray = arr.filter((cell) => cell !== undefined);

        // Fail if there are no results
        if (newArray.length === 0) {
            return undefined;
        }

        newArray.sort((a, b) => a - b);

        return newArray[Math.floor(newArray.length * p)];
    }

    // Returns the average of the array, but gives much more weight to the first values
    averageWithWeight(arr) {
        let total = 0;
        let totalWeights = 0;

        for (var i = 0; i < arr.length; i++) {
            if (arr[i] !== undefined) {

                let weight = 1 / Math.pow(i + 1, 3);
                // With that formula:
                //  - the weight of the 1st value is 1
                //  - of the 2nd value is 1/8
                //  - of the 3rd value is 1/27
                //  - of the 4th value is 1/64
                // ...

                total += arr[i] * weight;
                totalWeights += weight;
            }
        }

        if (totalWeights === 0) {
            return undefined;
        }

        return total / totalWeights;
    }

    simplifyTimingObject(timing) {
        return {
            name: timing.name,
            transferSize: timing.transferSize,
            domainLookupStart: Math.round(this.epoch + timing.domainLookupStart),
            domainLookupEnd: Math.round(this.epoch + timing.domainLookupEnd),
            connectStart: Math.round(this.epoch + timing.connectStart),
            connectEnd: Math.round(this.epoch + timing.connectEnd),
            requestStart: Math.round(this.epoch + timing.requestStart),
            responseStart: Math.round(this.epoch + timing.responseStart),
            responseEnd: Math.round(this.epoch + timing.responseEnd)
        };
    }

    getDownlinkMax() {
        if (self.navigator.connection && self.navigator.connection.downlinkMax > 0) {
            return self.navigator.connection.downlinkMax * 256; // convert Mbps to KBps
        }
        return Infinity;
    }
    
    initDatabase() {
        // Open database connection
        let dbPromise = self.indexedDB.open('howslow', 1)

        dbPromise.onupgradeneeded = (event) => {
            if (!event.target.result.objectStoreNames.contains('bw')) {
                event.target.result.createObjectStore('bw');
            }
        };

        dbPromise.onsuccess = (event) => {
            this.database = event.target.result;
            this.retrieveStats();
        };

        // Not handling DB errors cause it's ok, we can still work without DB
    }

    // Saves bandwidth & RTT to IndexedDB
    saveStats() {
        let object = {
            bandwidth: this.bandwidth,
            rtt: this.rtt,
            connectionType: self.navigator.connection && self.navigator.connection.type
        };

        try {
            this.database.transaction('bw', 'readwrite').objectStore('bw').put(object, 1);
        } catch(error) {
            // Silent error
        }
    }

    // Reads the latest known bandwidth & RTT from IndexedDB
    retrieveStats() {
        try {
            this.database.transaction('bw', 'readonly').objectStore('bw').get(1).onsuccess = (event) => {
                if (event.target.result) {
                    this.bandwidthFromDatabase = event.target.result.bandwidth || undefined;
                    this.rttFromDatabase = event.target.result.rtt || undefined;
                    this.connectionTypeFromDatabase = event.target.result.connectionType;
                }
            };
        } catch(error) {
            // Silent error
        }
    }
}

// Let's go!
self.howslow = new HowSlowForSW();