// Service Worker initialization
self.addEventListener('install', () => {
    console.log('SW installed');

    self.skipWaiting(); // Activate worker immediately
});

self.addEventListener('activate', () => {
    if (self.clients && self.clients.claim) {
        console.log('SW activated');

        // Make it available immediately
        self.clients.claim().then(() => {
            console.log('SW claimed');
        });
    }
});

// Intercept requests
self.addEventListener('fetch', (event) => {
    
    let modifiedUrl = null;

    // Intercept the image calls...
    const regexp = /image\.jpg\?timestamp=(.*)$/;
    const result = regexp.exec(event.request.url);

    if (result !== null) {

        // ... and choose the right image!

        if (estimator.bandwidth > 3000) {
            modifiedUrl = 'image-XXL.jpg?timestamp=' + result[1];
        } else if (estimator.bandwidth > 1000) {
            modifiedUrl = 'image-XL.jpg?timestamp=' + result[1];
        } else if (estimator.bandwidth > 300) {
            modifiedUrl = 'image-L.jpg?timestamp=' + result[1];
        } else if (estimator.bandwidth > 100) {
            modifiedUrl = 'image-M.jpg?timestamp=' + result[1];
        } else if (estimator.bandwidth > 30) {
            modifiedUrl = 'image-S.jpg?timestamp=' + result[1];
        } else if (estimator.bandwidth > 10) {
            modifiedUrl = 'image-XS.jpg?timestamp=' + result[1];
        }
    }

    // Add credentials to the request, otherwise fetch opens a new connection
    let options = (modifiedUrl && event.request.mode !== navigation) ? {credentials: 'include'} : null;

    event.respondWith(
        fetch(modifiedUrl ? modifiedUrl : event.request.url, options)
            .then(function(response) {
                estimator.addContentLength(event.request.url, response);
                return response;
            })
    );
});


class SpeedEstimator {
    
    constructor() {
        this.allTimings = [];
        this.allContentLengths = [];

        // To avoid very long dates, let's measure time from (now - 1000 seconds) 
        this.epoch = Date.now() - 1000000;

        setInterval(() => {
            const start = Date.now();
            this.ping = this._estimatePing();
            const middle = Date.now();
            this.bandwidth = this._estimateBandwidth();
            const end = Date.now();
            console.log('Took %dms for ping and %dms for bandwidth', middle - start, end - middle);

            console.log('Ping: ' + this.ping);
            console.log('Bandwidth: ' + this.bandwidth);
        }, 2000);

        // Broadcast a query to all pages from time to time
        setInterval(() => {
            self.clients.matchAll()
                .then((clients) => {
                    clients.forEach((client) => {
                        client.postMessage({
                            'command': 'timingsPlz'
                        });
                    });
                });
        }, 2000);

        // Then listen to the broadcast responses
        self.addEventListener('message', (event) => {
            if (event.data.command === 'eatThat') {
                // New timings just arrived from a page
                this.addTimings(event.data.timings);        
            }
        });
    }

    /*getPing() {
        return this.ping;
    }

    getBandwidth() {
        return this.bandwidth;
    }*/

    addTimings(timings) {
        timings.forEach((timing) => {

            // If this timings doesn't have the transferSize, let's grab it
            // from the content-length header saved earlier
            if (!timing.transferSize) {
                // a reverse loop should be faster and find the right answer
                for (var i = this.allContentLengths.length - 1; i >= 0; i--) {
                     if (this.allContentLengths[i].url === timing.name) {
                        const size = parseInt(this.allContentLengths[i].size, 10);
                        const time = timing.responseEnd - timing.responseStart;

                        // If the transfer is ridiculously fast (> 200Mbps), then it most probably comes
                        // from browser cache and timing is not reliable.
                        if (time === 0 || size / time < 26214) {
                            timing.transferSize = parseInt(this.allContentLengths[i].size, 10);
                        }

                        break;
                     }
                }
            }

            this.allTimings.push(timing);
        });
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
    
    _estimatePing() {
        let allPings = this.allTimings.map(timing => {
            // The estimated ping is an average of: DNS lookup time + First connection + SSL handshake
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

        return this._percentile(allPings, .5);
    }


    // Reads all given timings and estimate bandwidth
    _estimateBandwidth() {
        // As several resources can load simulteaneously, there's no simple way to estimate bandwidth.

        let intervals = [];
        let totalTransferedSize = 0;
        const INTERVAL_DURATION = 100;

        // Let's separate page load in 10ms time intervals and estimate the number of bytes loaded in each
        this.allTimings.forEach(timing => {

            let estimatedTransferSize = timing.transferSize;

            if (timing.transferSize && timing.responseStart && timing.responseEnd) {
                totalTransferedSize += timing.transferSize;

                let startingBlock = Math.floor((timing.responseStart - this.epoch) / INTERVAL_DURATION);
                let endingBlock = Math.floor((timing.responseEnd - this.epoch) / INTERVAL_DURATION);
                let bytesPerBlock = timing.transferSize / ((endingBlock - startingBlock) || 1);

                for (var i = startingBlock; i <= endingBlock; i++) {
                    intervals[i] = (intervals[i] || 0) + bytesPerBlock;
                }
            }
        });

        // Don't answer if we don't have enough data (less than 100KB)
        if (totalTransferedSize < 102400) {
            return null;
        }

        // Now let's use the 90th percentile of all values
        // From my different tests, that percentile provides good results
        const nineteenthPercentile = this._percentile(intervals, .9);

        // Convert bytes per 10ms to kilobytes per second (kilobytes, not kilobits!)
        const mbps = nineteenthPercentile * 1000 / INTERVAL_DURATION / 1024;

        return Math.round(mbps);
    }

    // Returns the value at a given percentile in a numeric array.
    // Not very accurate, but accurate enough for our needs.
    _percentile(arr, p) {

        // Remove nulls and transfer to a new array
        let newArray = arr.filter((cell) => {
            return cell !== null;
        });

        // Fail if there are no results
        if (newArray.length === 0) {
            return null;
        }

        newArray.sort((a, b) => {
            return a - b;
        });

        return newArray[Math.floor(newArray.length * p)];
    }
}

// Let's go!
const estimator = new SpeedEstimator();