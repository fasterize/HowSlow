const assert = require('assert');

const HowSlow = require('../index.js');


describe('Speed estimation', () => {

    const howslow = new HowSlow();

    describe('estimatePing on the main HTML request', () => {
    
        it('should return null when no usable information is available', () => {
            const timing = {
                "navigationStart": 1523657080929,
                "unloadEventStart": 1523657081070,
                "unloadEventEnd": 1523657081070,
                "redirectStart": 0,
                "redirectEnd": 0,
                "fetchStart": 1523657080934,
                "domainLookupStart": 1523657080934,
                "domainLookupEnd": 1523657080934,
                "connectStart": 1523657080934,
                "connectEnd": 1523657080934,
                "secureConnectionStart": 0,
                "requestStart": 1523657080942,
                "responseStart": 1523657081066,
                "responseEnd": 1523657081069,
                "domLoading": 1523657081130,
                "domInteractive": 1523657081229,
                "domContentLoadedEventStart": 1523657081229,
                "domContentLoadedEventEnd": 1523657081265,
                "domComplete": 1523657081681,
                "loadEventStart": 1523657081682,
                "loadEventEnd": 1523657081705
            };
            assert.equal(howslow._estimatePing(timing, 'http:'), null);
        });

        it('should estimate ping on a HTTP main request', () => {
            const timing = {
                "navigationStart": 1523658178610,
                "unloadEventStart": 1523658179116,
                "unloadEventEnd": 1523658179116,
                "redirectStart": 0,
                "redirectEnd": 0,
                "fetchStart": 1523658178618,
                "domainLookupStart": 1523658178700,
                "domainLookupEnd": 1523658178860,
                "connectStart": 1523658178860,
                "connectEnd": 1523658178982,
                "secureConnectionStart": 0,
                "requestStart": 1523658178982,
                "responseStart": 1523658179112,
                "responseEnd": 1523658179115,
                "domLoading": 1523658179141,
                "domInteractive": 1523658179355,
                "domContentLoadedEventStart": 1523658179356,
                "domContentLoadedEventEnd": 1523658179386,
                "domComplete": 1523658180399,
                "loadEventStart": 1523658180399,
                "loadEventEnd": 1523658180411
            };
            assert.equal(howslow._estimatePing(timing, 'http:'), 141);
        });

        it('should estimate ping on HTTPS without DNS lookup', () => {
            const timing = {
                "navigationStart": 1523658178610,
                "unloadEventStart": 1523658179116,
                "unloadEventEnd": 1523658179116,
                "redirectStart": 0,
                "redirectEnd": 0,
                "fetchStart": 1523658178618,
                "domainLookupStart": 1523658178860,
                "domainLookupEnd": 1523658178860,
                "connectStart": 1523658178860,
                "connectEnd": 1523658178981,
                "secureConnectionStart": 1523658178915,
                "requestStart": 1523658178982,
                "responseStart": 1523658179112,
                "responseEnd": 1523658179115,
                "domLoading": 1523658179141,
                "domInteractive": 1523658179355,
                "domContentLoadedEventStart": 1523658179356,
                "domContentLoadedEventEnd": 1523658179386,
                "domComplete": 1523658180399,
                "loadEventStart": 1523658180399,
                "loadEventEnd": 1523658180411
            };
            assert.equal(howslow._estimatePing(timing, 'https:'), 61);
        });

        it('should estimate ping on HTTPS with DNS lookup', () => {
            const timing = {
                "navigationStart": 1523659290449,
                "unloadEventStart": 1523659294601,
                "unloadEventEnd": 1523659294601,
                "redirectStart": 0,
                "redirectEnd": 0,
                "fetchStart": 1523659290466,
                "domainLookupStart": 1523659290471,
                "domainLookupEnd": 1523659290742,
                "connectStart": 1523659290742,
                "connectEnd": 1523659290876,
                "secureConnectionStart": 1523659290801,
                "requestStart": 1523659290876,
                "responseStart": 1523659294594,
                "responseEnd": 1523659294644,
                "domLoading": 1523659294627,
                "domInteractive": 1523659294841,
                "domContentLoadedEventStart": 1523659294842,
                "domContentLoadedEventEnd": 1523659294896,
                "domComplete": 1523659295862,
                "loadEventStart": 1523659295862,
                "loadEventEnd": 1523659295916
            };
            assert.equal(howslow._estimatePing(timing, 'https:'), 135);
        });

    });

    describe('estimatePing on a sub-resource request', () => {

        it('should return null when the TCP connection is already open', () => {
            const timing = {
                "name": "https://main.domain.com/request",
                "entryType": "resource",
                "startTime": 649.8000002466142,
                "duration": 9.800000116229057,
                "initiatorType": "link",
                "nextHopProtocol": "h2",
                "workerStart": 0,
                "redirectStart": 0,
                "redirectEnd": 0,
                "fetchStart": 649.8000002466142,
                "domainLookupStart": 649.8000002466142,
                "domainLookupEnd": 649.8000002466142,
                "connectStart": 649.8000002466142,
                "connectEnd": 649.8000002466142,
                "secureConnectionStart": 0,
                "requestStart": 652.4000000208616,
                "responseStart": 655.3000002168119,
                "responseEnd": 659.6000003628433,
                "transferSize": 0,
                "encodedBodySize": 11151,
                "decodedBodySize": 85055,
                "serverTiming": []
            };
            assert.equal(howslow._estimatePing(timing, 'http:'), null);
        });

        it('should return null on third party without Timing-Allow-Origin header', () => {
            const timing = {
                "name": "http://third.party.com/http-request",
                "entryType": "resource",
                "startTime": 2751.499999780208,
                "duration": 471.6000002808869,
                "initiatorType": "img",
                "nextHopProtocol": "http/1.1",
                "workerStart": 0,
                "redirectStart": 0,
                "redirectEnd": 0,
                "fetchStart": 2751.499999780208,
                "domainLookupStart": 0,
                "domainLookupEnd": 0,
                "connectStart": 0,
                "connectEnd": 0,
                "secureConnectionStart": 0,
                "requestStart": 0,
                "responseStart": 0,
                "responseEnd": 3223.1000000610948,
                "transferSize": 0,
                "encodedBodySize": 0,
                "decodedBodySize": 0,
                "serverTiming": []
            };
            assert.equal(howslow._estimatePing(timing, 'http:'), null);
        });

        it('should estimate ping on a HTTP resource with Timing-Allow-Origin header', () => {
            const timing = {
                "name": "http://third.party.com/http-request",
                "entryType": "resource",
                "startTime": 3855.5999998934567,
                "duration": 440.2999999001622,
                "initiatorType": "script",
                "nextHopProtocol": "http/1.1",
                "workerStart": 0,
                "redirectStart": 0,
                "redirectEnd": 0,
                "fetchStart": 3855.5999998934567,
                "domainLookupStart": 3857.1999999694526,
                "domainLookupEnd": 3884.1999997384846,
                "connectStart": 3884.1999997384846,
                "connectEnd": 3905.7000000029802,
                "secureConnectionStart": 0,
                "requestStart": 3908.599999733269,
                "responseStart": 3934.2000000178814,
                "responseEnd": 4295.899999793619,
                "transferSize": 29300,
                "encodedBodySize": 28769,
                "decodedBodySize": 78698,
                "serverTiming": []
            };
            assert.equal(howslow._estimatePing(timing, 'http:'), 24);
            // Whatever is the main page protocol
            assert.equal(howslow._estimatePing(timing, 'https:'), 24);
        });

        it('should estimate ping on a HTTPS resource', () => {
            const timing = {
                "name": "https://third.party.com/https-request",
                "entryType": "resource",
                "startTime": 5867.000000085682,
                "duration": 564.599999692291,
                "initiatorType": "script",
                "nextHopProtocol": "h2",
                "workerStart": 0,
                "redirectStart": 0,
                "redirectEnd": 0,
                "fetchStart": 5867.000000085682,
                "domainLookupStart": 6166.699999943376,
                "domainLookupEnd": 6183.100000023842,
                "connectStart": 6183.100000023842,
                "connectEnd": 6324.999999720603,
                "secureConnectionStart": 6224.699999671429,
                "requestStart": 6325.600000098348,
                "responseStart": 6424.099999945611,
                "responseEnd": 6431.599999777973,
                "transferSize": 7332,
                "encodedBodySize": 6757,
                "decodedBodySize": 17945,
                "serverTiming": []
            };
            assert.equal(howslow._estimatePing(timing, 'http:'), 53);
            // Whatever is the main page protocol
            assert.equal(howslow._estimatePing(timing, 'https:'), 53);
        });
    });

    /*describe('estimateBandwidthOld', () => {
    
        it('should return null when not enough information is available', () => {
            const timing = {
                "name": "https://third.party.com/request",
                "entryType": "resource",
                "startTime": 14045.600000303239,
                "duration": 168.0999998934567,
                "initiatorType": "img",
                "nextHopProtocol": "h2",
                "workerStart": 0,
                "redirectStart": 0,
                "redirectEnd": 0,
                "fetchStart": 14045.600000303239,
                "domainLookupStart": 0,
                "domainLookupEnd": 0,
                "connectStart": 0,
                "connectEnd": 0,
                "secureConnectionStart": 0,
                "requestStart": 0,
                "responseStart": 0,
                "responseEnd": 14213.700000196695,
                "transferSize": 0,
                "encodedBodySize": 0,
                "decodedBodySize": 0,
                "serverTiming": []
            };
            assert.equal(howslow._estimateBandwidth(timing), null);
        });

        it('should estimate bandwidth on a third pary', () => {
            const timing = {
                "name": "https://third.party.com/https-request",
                "entryType": "resource",
                "startTime": 5867.000000085682,
                "duration": 564.599999692291,
                "initiatorType": "script",
                "nextHopProtocol": "h2",
                "workerStart": 0,
                "redirectStart": 0,
                "redirectEnd": 0,
                "fetchStart": 5867.000000085682,
                "domainLookupStart": 6166.699999943376,
                "domainLookupEnd": 6183.100000023842,
                "connectStart": 6183.100000023842,
                "connectEnd": 6324.999999720603,
                "secureConnectionStart": 6224.699999671429,
                "requestStart": 6325.600000098348,
                "responseStart": 6424.099999945611,
                "responseEnd": 6431.599999777973,
                "transferSize": 7332,
                "encodedBodySize": 6757,
                "decodedBodySize": 17945,
                "serverTiming": []
            };
            console.log(howslow._estimateBandwidth(timing));
            assert.equal(howslow._estimateBandwidth(timing), Math.round((7332*8/1024/1024)/(7.5/1000) * 1000) / 1000);
        });
    });*/

    describe('estimateBandwidth', () => {
    
        it('should calculate the percentile', () => {
            const howslow = new HowSlow();
            assert.equal(howslow._percentile([], .8), null);
            assert.equal(howslow._percentile([0, 1, 2, 3, 4, 5, 6, 7, 8, 9], .8), 8);
            assert.equal(howslow._percentile([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10], .8), 8);
            assert.equal(howslow._percentile([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], .8), 9);
            assert.equal(howslow._percentile([9, 8, 7, 3, 4, 5, 6, 2, 0, 1], .8), 8);
            assert.equal(howslow._percentile([8, undefined, undefined, undefined, 6, undefined, 4], .5), 6);
            assert.equal(howslow._percentile([8, 6], .4), 6);
            assert.equal(howslow._percentile([8, 6], .6), 8);
        });

        it('should resist to "divide by zero"', () => {
            // Special case when responseStart and responseEnd are in the same 10ms interval
            assert.equal(howslow._estimateBandwidth([
                {
                    responseStart: 7771,
                    responseEnd: 7778,
                    transferSize: 200000
                }
            ]), 19531);
        });

        it('should respond with null when not enough data was transfered', () => {
            assert.equal(howslow._estimateBandwidth([
                {
                    responseStart: 500,
                    responseEnd: 800,
                    transferSize: 1000
                }
            ]), null);
        });

        it('simple estimation, only one download', () => {
            assert.equal(howslow._estimateBandwidth([
                {
                    responseStart: 1000,
                    responseEnd: 2000,
                    transferSize: 102400
                }
            ]), 100);
        });

        it('two separated downloads', () => {
            assert.equal(howslow._estimateBandwidth([
                {
                    responseStart: 1000,
                    responseEnd: 2000,
                    transferSize: 102400
                },
                {
                    responseStart: 3000,
                    responseEnd: 4000,
                    transferSize: 102400
                }
            ]), 100);
        });

        it('two simultaneous downloads', () => {
            assert.equal(howslow._estimateBandwidth([
                {
                    responseStart: 1000,
                    responseEnd: 2000,
                    transferSize: 102400
                },
                {
                    responseStart: 1000,
                    responseEnd: 2000,
                    transferSize: 102400
                }
            ]), 200);
        });

        it('two simultaneous downloads with a peak', () => {
            assert.equal(howslow._estimateBandwidth([
                {
                    responseStart: 1000,
                    responseEnd: 2000,
                    transferSize: 102400
                },
                {
                    responseStart: 1500,
                    responseEnd: 1750,
                    transferSize: 102400
                }
            ]), 500);
        });

        it('two simultaneous but delayed downloads', () => {
            assert.equal(howslow._estimateBandwidth([
                {
                    responseStart: 1000,
                    responseEnd: 2000,
                    transferSize: 102400
                },
                {
                    responseStart: 1500,
                    responseEnd: 2500,
                    transferSize: 102400
                }
            ]), 200);
        });
    });
});