class HowSlow {

    constructor(win) {
        this.win = win;

        // 1) Récupérer l'historique des vitesses dans le localStorage
        // 2) 
    }

    // Assertions :
    // - HTTP2
    // - Pas ou très peu de domain sharding

    _analyseResourceTimingsOnDOMReady() {

        var resourceTimings = this.win.performance.getEntries('resource');
        var found = resourceTimings.some(function(resource) {
            if (scripts[index] && resource.name === scripts[index].url) {
                scripts[index].downloadStart = Math.round(originalTime + resource.startTime);
                scripts[index].downloadTime = Math.round(resource.duration);
                scripts[index].downloadEnd = Math.round(originalTime + resource.startTime + resource.duration);
                return true;  
            }
            return false;
        });
    }

    _analyseResourceTimingsOnDOMComplete() {

    }

    // Returns the ping or null if not enough information
    _estimatePing(timing, protocol) {
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
    }

    // Reads all given timings and estimate bandwidth
    _estimateBandwidth(allTimings) {
        // As several resources can load simulteaneously, there's no simple way to estimate bandwidth.

        let intervals = [];
        let totalTransferedSize = 0;

        // Let's separate page load in 10ms time intervals and estimate the number of bytes loaded in each
        allTimings.forEach(timing => {
            
            // Chrome : OK since?
            // Firefox : OK since?
            // Safari : no transfer size in Safari 11
            // IE : no transfer size at all?

            var estimatedTransferSize = timing.transferSize;

            if (timing.transferSize && timing.responseStart && timing.responseEnd) {
                totalTransferedSize += timing.transferSize;

                var startingBlock = Math.floor(timing.responseStart / 10);
                var endingBlock = Math.floor(timing.responseEnd / 10);
                var bytesPerBlock = timing.transferSize / ((endingBlock - startingBlock) || 1);

                for (var i = startingBlock; i <= endingBlock; i++) {
                    intervals[i] = (intervals[i] || 0) + bytesPerBlock;
                }
            }
        });

        // Don't answer if we don't have enough data (less than 100kB)
        if (totalTransferedSize < 102400) {
            return null;
        }

        // Now let's use the 90th percentile of all values
        // From my different tests, that percentile provides good results
        const nineteenthPercentile = this._percentile(intervals, .9);

        // Convert bytes per 10ms to kilobytes per second (kilobytes, not kilobits!)
        const mbps = nineteenthPercentile / 10.24; // n * 100 / 1024 / 1024

        return Math.round(mbps);
    }

    // Returns the value at a given percentile in a numeric array.
    // Not very accurate, but accurate enough for our needs.
    _percentile(arr, p) {
        
        // Remove empty cells in array
        arr = arr.filter(cell => {
            return cell !== undefined;
        });

        // Fail if there are no results
        if (arr.length === 0) {
            return null;
        }

        arr.sort((a, b) => {
            return a - b;
        });

        return arr[Math.floor(arr.length * p)];
    }


    // Attention en utisant les temps de réponse, il ne faut pas inclure le temps d'attente (surtout en HTTP2) !!!
    // --> https://www.stevesouders.com/blog/2014/11/25/serious-confusion-with-resource-timing/
    // dns = r.domainLookupEnd - r.domainLookupStart;
    // tcp = r.connectEnd - r.connectStart; // includes ssl negotiation
    // waiting = r.responseStart - r.requestStart;
    // content = r.responseEnd - r.responseStart;
    // networkDuration = dns + tcp + waiting + content;

    // Quelle mesure de vitesse peut-on utiliser ?
    // - Le temps moyen de réponse des requêtes ? Ça serait oublier qu'elles se chargent en parallèle.
    // - Le temps en fonction de leur poids ? Mais c'est pareil !
    // - Sur une connexion http2, on peut plus facilement estimer la bande passante lorsqu'il y a plein de requêtes qui s'enchaînent
    // - Surtout si on se base sur les requêtes en HIGHEST priority : HTML, CSS et Fonts
    // - L'idée est de mettre à plat toutes les requêtes vers le domaine principal et de ne regarder pour chaque que le temps entre 
    //      responseStart et responseEnd

    // ---====
    //       --=====
    //       --===
    //          ----===
    //                    ---====
    //                    ---====

    // Plusieurs mesures sont intéressantes :
    // - Avant la première requête secondaire, on peut se baser sur dns + tcp + waiting
    //          ... mais ça peut s'avérer une fausse alerte
    // - ou bien sur la Network API
    // - À partir du DOM Ready, on peut switcher sur les premières requêtes reçues et estimer la bande passante
    // - Après le DOM Complete, on arrête de mesurer, c'est trop risqué
}

module.exports = HowSlow;