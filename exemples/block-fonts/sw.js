// Load howslow
self.importScripts('howSlowForSW.js');

// Don't just block the WOFF2 file, block all extentions because when
// a font is in error, the browser will try the other font formats.
function urlBlockingHook(url) {
    const execResult = /\/static\/fonts\/fontname\.(woff|woff2|ttf)/.exec(url);
    return (execResult !== null && howslow.getBandwidth() < 50);
}