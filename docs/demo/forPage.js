'use strict';

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var HowSlowForPage = function () {
    function HowSlowForPage(swPath) {
        var _this = this;

        _classCallCheck(this, HowSlowForPage);

        this.bandwidth = undefined;
        this.rtt = undefined;
        this.firstRequestSent = false;
        this.navigationStart = 0;

        this.initSW(swPath).then(function () {
            return _this.listenToSW();
        });

        this.storageIO();
    }

    _createClass(HowSlowForPage, [{
        key: 'getBandwidth',
        value: function getBandwidth() {
            return this.bandwidth;
        }
    }, {
        key: 'getRTT',
        value: function getRTT() {
            return this.rtt;
        }

        // Initializes the Service Worker, or at least tries

    }, {
        key: 'initSW',
        value: function initSW(swPath) {
            return new Promise(function (resolve, reject) {
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
                    window.navigator.serviceWorker.register(swPath).then(window.navigator.serviceWorker.ready).then(function (serviceWorkerRegistration) {
                        // The service worker is registered and should even be ready now
                        resolve();
                    });
                }
            });
        }

        // Geting ready to receive messages from the Service Worker

    }, {
        key: 'listenToSW',
        value: function listenToSW() {
            var _this2 = this;

            window.navigator.serviceWorker.onmessage = function (event) {
                if (event.data.command === 'timingsPlz') {
                    // The Service Workers asks for resource timings
                    var timings = _this2.readLatestResourceTimings();

                    if (timings.length > 0) {
                        _this2.sendResourceTimings(timings);
                    }
                } else if (event.data.command === 'stats') {
                    // The Service Workers sends the latest stats
                    _this2.bandwidth = event.data.bandwidth;
                    _this2.rtt = event.data.rtt;
                }
            };
        }

        // Gathers the latest ResourceTimings and sends them to SW

    }, {
        key: 'sendResourceTimings',
        value: function sendResourceTimings(simplifiedTimings) {
            try {
                navigator.serviceWorker.controller.postMessage({
                    'command': 'eatThat',
                    'timings': simplifiedTimings
                });
            } catch (error) {}
        }

        // Gathers the ResourceTimings from the API

    }, {
        key: 'readLatestResourceTimings',
        value: function readLatestResourceTimings() {
            var _this3 = this;

            // Not compatible browsers
            if (!window.performance || !window.performance.getEntriesByType || !window.performance.timing) {
                return [];
            }

            var timings = [];

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

            window.performance.getEntriesByType('resource').forEach(function (timing) {
                timings.push({
                    name: timing.name,
                    transferSize: timing.transferSize,
                    domainLookupStart: Math.round(_this3.navigationStart + timing.domainLookupStart),
                    domainLookupEnd: Math.round(_this3.navigationStart + timing.domainLookupEnd),
                    connectStart: Math.round(_this3.navigationStart + timing.connectStart),
                    connectEnd: Math.round(_this3.navigationStart + timing.connectEnd),
                    secureConnectionStart: Math.round(_this3.navigationStart + timing.secureConnectionStart),
                    requestStart: Math.round(_this3.navigationStart + timing.requestStart),
                    responseStart: Math.round(_this3.navigationStart + timing.responseStart),
                    responseEnd: Math.round(_this3.navigationStart + timing.responseEnd)
                });
            });

            // Now lets clear resourceTimings
            window.performance.clearResourceTimings();
            window.performance.setResourceTimingBufferSize(200);

            // TODO: add an option to avoid clearing ResourceTimings...
            // ... some other scripts might need them!

            return timings;
        }

        // On the SW's side, stats are saved in IndexedDB. Here we have access to LocalStorage.

    }, {
        key: 'storageIO',
        value: function storageIO() {
            var _this4 = this;

            // When leaving the page, save stats into LocalStorage for faster ignition
            window.addEventListener('unload', function () {
                if (_this4.bandwidth || _this4.rtt) {
                    window.localStorage.setItem('howslow', _this4.bandwidth + ',' + _this4.rtt);
                }
            });

            // And when arriving on the page, retrieve stats
            var stats = window.localStorage.getItem('howslow');
            if (stats) {
                stats = stats.split(',');
                this.bandwidth = stats[0] || undefined;
                this.rtt = stats[1] || undefined;
            }
        }
    }]);

    return HowSlowForPage;
}();
