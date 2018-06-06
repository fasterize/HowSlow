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
            console.log('Estimated bandwidth: %s KB/s', this.bandwidth || 'unknown');
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

    // Updates bandwidth & ttl
    refreshStats() {
        
        // Update the data from resource timings
        this.refreshTimings();
        
        // Use the data to estimate bandwidth
        this.bandwidth = this.estimateBandwidth();
        this.ttl = this.estimateTTL();
        
        // If the bandwith was correctly estimated, we save it to database
        if (this.bandwidth) {
            this.saveBandwidth();
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

    // What a good idea we had to save the urls that were modified by the service worker!
    // Because we need one
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
    
    estimateTTL() {
        let allPings = this.allTimings.map(timing => {
            // The estimated TTL is an average of: DNS lookup time + First connection + SSL handshake
            // in milliseconds.
            //
            // Note: we can't rely on secureConnectionStart because IE doesn't provide it.
            // So we use the resource's protocol
            //
            const dns = timing.domainLookupEnd - timing.domainLookupStart;
            const tcp = timing.connectEnd - timing.connectStart;

            // If the given timing has a name, than it's for a resource, rather than the main HTML request:
            const sslHandshake = +(timing.name ? (timing.name.indexOf('https:') === 0) : (protocol === 'https:'));
            
            const roundtripsCount = (dns > 5) + (tcp > 5) + sslHandshake;
            return (roundtripsCount === sslHandshake) ? null : Math.round((dns + tcp) / roundtripsCount);
        });

        return this.percentile(allPings, .5);
    }


    // Reads all given timings and estimate bandwidth
    estimateBandwidth() {
        
        // Let's estimate the bandwidth for some different periods of times (in minutes)
        const ages = [1, 10, 100, 1000, 10000]; // 10000 minutes is approx one week

        const bandwidths = ages.map((bw) => this.estimateBandwidthForAPeriod(bw));

        // Now we're going to find the average of all these bandwidths, and we give heigher weights
        // to the most recents.

        let total = 0;
        let totalWeights = 0;

        for (var i = 0; i < bandwidths.length; i++) {
            if (bandwidths[i] !== null) {

                let weight = 1 / Math.pow(i + 1, 2);
                // With that formula:
                //  - the weight of the 1st minute is 1
                //  - of the 10 first minutes is 1/4
                //  - of the 100 is 1/9
                //  - of the 1000 is 1/16
                //  - of the 10000 is 1/25

                total += bandwidths[i] * weight;
                totalWeights += weight;
            }
        }

        // Some mobile browsers (Android) can tell from the network currently used
        // the theorical max speed of that network with "connection.downlinkMax".
        // Exemple: downlinkMax for 2G is 0.134 Mbps

        if (totalWeights === 0) {
            return null;
        }

        let result = total / totalWeights;
        
        // Always cap bandwidth with the theorical max speed of underlying network
        // (when the Network Information API is available, of course)
        // It makes the library more reactive when, for exemple, the user
        // sudenly looses its 3G signal and gets 2G instead.
        result = Math.min(result, this.getDownlinkMax());

        return Math.round(result);
    }

    // Estimate bandwidth for the last given number of minutes
    estimateBandwidthForAPeriod(numberOfMinutes) {
        
        // Now minus the number of minutes
        const from = Date.now() - this.epoch - (numberOfMinutes * 60 * 1000);

        // Retrieves corresponding cells in the timeline array
        const newArray = this.allIntervals.slice(from / this.INTERVAL_DURATION);
        
        if (newArray.length === 0) {
            return null;
        }

        // Sums up the transfered size in this duration
        const transferedSize = newArray.reduce((a, b) => a + b);
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

    simplifyTimingObject(timing) {
        return {
            name: timing.name,
            transferSize: timing.transferSize,
            domainLookupStart: Math.round(this.epoch + timing.domainLookupStart),
            domainLookupEnd: Math.round(this.epoch + timing.domainLookupEnd),
            connectStart: Math.round(this.epoch + timing.connectStart),
            connectEnd: Math.round(this.epoch + timing.connectEnd),
            secureConnectionStart: Math.round(this.epoch + timing.secureConnectionStart),
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
            this.retrieveBandwidth();
        };

        // Not handling DB errors cause it's ok, we can still work without DB
    }

    // Saves bandwidth to IndexedDB
    saveBandwidth() {
        let object = {
            bandwidth: this.bandwidth,
            connectionType: self.navigator.connection && self.navigator.connection.type
        };

        if (this.database) {
            this.database.transaction('bw', 'readwrite').objectStore('bw').put(object, 1);
        }
    }

    // Reads the latest known bandwidth from IndexedDB
    retrieveBandwidth() {
        this.database.transaction('bw', 'readonly').objectStore('bw').get(1).onsuccess = (event) => {
            this.lastKnownBandwidth = event.target.result.bandwidth || null;
            this.lastKnownConnectionType = event.target.result.connectionType;
        };
    }
}

// Let's go!
const estimator = new SpeedEstimator();