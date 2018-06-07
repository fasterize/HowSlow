/* ----- Adapt to your needs ----- */

function myUrlRewritingFunction(url) {
    
    // This is some demo code. Adapt to your needs.

    // Let's intercept every call to image.jpg
    const regexp = /image\.jpg\?timestamp=(.*)$/;
    const execResult = regexp.exec(url);

    if (execResult !== null) {

        // ... and choose the right image!
        var bandwidth = estimator.getBandwidth();

        if (bandwidth > 3000) {
            return 'image-XXL.jpg?timestamp=' + execResult[1];
        } else if (bandwidth > 1000) {
            return 'image-XL.jpg?timestamp=' + execResult[1];
        } else if (bandwidth > 300) {
            return 'image-L.jpg?timestamp=' + execResult[1];
        } else if (bandwidth > 100) {
            return 'image-M.jpg?timestamp=' + execResult[1];
        } else if (bandwidth > 30) {
            return 'image-S.jpg?timestamp=' + execResult[1];
        } else if (bandwidth > 10) {
            return 'image-XS.jpg?timestamp=' + execResult[1];
        } else {
            return 'image-unknown.jpg?timestamp=' + execResult[1];
        }
    }

    // Return null for urls you don't want to change
    return null;
}



/* ----- No change below this line ----- */

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
            estimator.askTimingToAllClients();
        });
    }
});

// Intercept requests
self.addEventListener('fetch', (event) => {
    
    let modifiedUrl = myUrlRewritingFunction(event.request.url);
    let options = {};

    if (modifiedUrl) {
        // Add credentials to the request, otherwise fetch opens a new connection
        options.credentials = 'include';
    }

    event.respondWith(
        fetch((modifiedUrl || event.request), options)
            .then(function(response) {
                // Saves the new url for later use
                estimator.addUrlRewriting(event.request.url, response.url);
                // As well as the content-length header
                estimator.addContentLength(response.url, response);
                return response;
            })
    );
});


class SpeedEstimator {
    
    constructor() {
        this.allTimings = [];
        this.allUrlRewritings = {};
        this.allContentLengths = [];
        this.allIntervals = [];
        this.INTERVAL_DURATION = 25; // in milliseconds

        // That's our supposed service worker initialization time
        // TODO: replace by the reference time used inside the SW's Resource Timings
        // (I have no idea how to find it)
        this.epoch = Date.now();

        // Start the ticker
        setInterval(() => {
            this.refreshStats();
        }, 1000);

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

    getBandwidth() {
        if (this.bandwidth) {
            return this.bandwidth;
        }

        // If we couldn't estimate bandwidth yet, but we've got a record in database
        // We serve the saved bandwidth
        if (!this.lastKnownConnectionType
            || !self.navigator.connection
            || !self.navigator.connection.type
            || this.lastKnownConnectionType === self.navigator.connection.type) {

            return this.lastKnownBandwidth;
        }

        return null;
    }

    getRTT() {
        if (this.rtt) {
            return this.rtt;
        }

        // If we couldn't estimate bandwidth yet, but we've got a record in database
        // We serve the saved bandwidth
        if (!this.lastKnownConnectionType
            || !self.navigator.connection
            || !self.navigator.connection.type
            || this.lastKnownConnectionType === self.navigator.connection.type) {

            return this.lastKnownRTT;
        }

        return null;
    }

    // Updates bandwidth & rtt
    refreshStats() {
        
        // Update the data from resource timings
        this.refreshTimings();
        
        // Use the data to estimate bandwidth
        this.bandwidth = this.estimateBandwidth();
        this.rtt = this.estimateRTT();
        
        // If the bandwith was correctly estimated, we save it to database
        if (this.bandwidth || this.rtt) {
            this.saveStats();
        }
    }

    // Collects the latest resource timings
    refreshTimings() {

        if (this.shouldAskTimingsToPage()) {
            // If the Service Worker doesn't have access to the Resource Timings API, 
            // we ask to each attached page (= client) its timings.
            // We won't be able to use them immediately, but they should be there on the next tick
            this.askTimingToAllClients();

        } else {
            // The Service Worker has access to the Ressource Timings API,
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
    }

    // Sends a request to all clients for their resource timings.
    askTimingToAllClients() {
        self.clients.matchAll()
            .then((clients) => {
                clients.forEach((client) => {
                    client.postMessage({
                        command: 'timingsPlz'
                    });
                });
            });
    }

    // Saves one timing in the allTimings list
    // only if it doesn't look like it comes from the browser's cache
    addOneTiming(timing) {

        // As the Service Worker is able to change the url of a request,
        // we let's use the new url.
        timing.name = this.findNewUrl(timing.name);

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

    // And what a good idea we had to also save the urls that were modified by the service worker!
    // Because we need one.
    findNewUrl(originalUrl) {
        return this.allUrlRewritings[originalUrl] || originalUrl;
    }

    // Saves url rewritings in a list for later use
    addUrlRewriting(originalUrl, newUrl) {
        this.allUrlRewritings[originalUrl] = newUrl;
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
        
        // Let's estimate the bandwidth for some different periods of times (in minutes)
        const ages = [1, 10, 100, 1000, 10000]; // 10000 minutes is approx one week
        const bandwidths = ages.map((bw) => this.estimateBandwidthForAPeriod(bw));
        
        let result = this.averageWithWeight(bandwidths);
        
        // Always cap bandwidth with the theorical max speed of underlying network
        // (when the Network Information API is available, of course)
        // It makes the library more reactive when, for exemple, the user
        // sudenly looses its 3G signal and gets 2G instead.
        result = Math.min(result, this.getDownlinkMax());

        return Math.round(result);
    }

    // Estimates bandwidth for the last given number of minutes
    estimateBandwidthForAPeriod(numberOfMinutes) {
        
        // Now, minus the number of minutes
        const from = Date.now() - this.epoch - (numberOfMinutes * 60 * 1000);

        // Retrieves corresponding cells in the timeline array
        const newArray = this.allIntervals.slice(from / this.INTERVAL_DURATION);
        
        if (newArray.length === 0) {
            return null;
        }

        // Sums up the transfered size in this duration
        const transferedSize = newArray.reduce((a, b) => a + b);
        
        // Skip estimating bandwidth if too few kilobytes were collected
        if (transferedSize < 102400) {
            return null;
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
        const ages = [1, 10, 100, 1000, 10000]; // 10000 minutes is approx one week
        const rtts = ages.map((bw) => this.estimateRTTForAPeriod(bw));
        
        return Math.round(this.averageWithWeight(rtts));
    }

    // Estimates RTT for the last given number of minutes
    estimateRTTForAPeriod(numberOfMinutes) {
        
        // Now, minus the number of minutes
        const from = Date.now() - (numberOfMinutes * 60 * 1000);

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
            return null;
        }

        // Let's use the 20th percentile here, to eliminate servers' slowness
        return this.percentile(pings, .2);
    }

    // Returns the value at a given percentile in a numeric array.
    // Not very accurate, but accurate enough for our needs.
    percentile(arr, p) {

        // Remove nulls and transfer to a new array
        let newArray = arr.filter((cell) => cell !== null);

        // Fail if there are no results
        if (newArray.length === 0) {
            return null;
        }

        newArray.sort((a, b) => a - b);

        return newArray[Math.floor(newArray.length * p)];
    }

    // Returns the average of the array, but gives much more weight to the first values
    averageWithWeight(arr) {
        let total = 0;
        let totalWeights = 0;

        for (var i = 0; i < arr.length; i++) {
            if (arr[i] !== null) {

                let weight = 1 / Math.pow(i + 1, 2);
                // With that formula:
                //  - the weight of the 1st minute is 1
                //  - of the 10 first minutes is 1/4
                //  - of the 100 is 1/9
                //  - of the 1000 is 1/16
                //  - of the 10000 is 1/25

                total += arr[i] * weight;
                totalWeights += weight;
            }
        }

        if (totalWeights === 0) {
            return null;
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
            secureConnectionStart: Math.round(this.epoch + timing.secureConnectionStart),
            requestStart: Math.round(this.epoch + timing.requestStart),
            responseStart: Math.round(this.epoch + timing.responseStart),
            responseEnd: Math.round(this.epoch + timing.responseEnd)
        };
    }

    // Returns false if the SW has access to the Resource Timings API
    // Returns true if we need to ask the page for the resource list
    shouldAskTimingsToPage() {
        
        // TODO: replace User Agent detection with true detection

        return /Edge/.test(self.navigator.userAgent);
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
                this.lastKnownBandwidth = event.target.result.bandwidth || null;
                this.lastKnownRTT = event.target.result.rtt || null;
                this.lastKnownConnectionType = event.target.result.connectionType;
            };
        } catch(error) {
            // Silent error
        }
    }
}

// Let's go!
const estimator = new SpeedEstimator();