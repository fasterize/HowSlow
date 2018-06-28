// Load howslow
self.importScripts('howSlowForSW.js');

// Here we use the urlRewritingHook. This function is called on each resource
// fetched by the page.
// If the return value is null, nothing is changed.
// If the value is an URL, it replaces the inital URL.
function urlRewritingHook(url) {
    
    // Let's intercept every editorial image call
    const regexp = /images\/editorial\/(.*)\.jpg$/;
    const execResult = regexp.exec(url);

    if (execResult !== null && howslow.getBandwidth() > 1000) {
        // Add an "-hd" suffix to the image name
        return '/images/editorial/' + execResult[1] + '-hd.jpg';
    }

    // Respond null for the default behavior
    return null;
}