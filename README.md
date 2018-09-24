HowSlow is an in-browser bandwidth and RTT (roundtrip time) estimator based on a Service Worker and the Resource Timing API. When deployed on a website, it allows developers to adapt design or behavior according to the each user's bandwidth.


## How does it work?

Basicaly, the Service Worker includes an algorythm that reads previous [Resource Timing](https://developer.mozilla.org/en-US/docs/Web/API/Resource_Timing_API/Using_the_Resource_Timing_API), uses them to estimate the connectivity metrics and constantly adjusts them after every newly downloaded resource.

![From network monitoring to bandwidth estimation](./docs/howslow-waterfall-to-stats.png "HowSlow : from network monitoring to bandwidth estimation")

Estimated bandwidth and RTT are available both in the Service Worker and the JavaScript scope of the page to allow a large variety of behaviors.


## What is it good for?

Send some love ❤️ to your slower users:
+ load lower quality images
+ avoid loading some heavy third parties such as ads, retargeting tags, AB Testing...
+ display a clickable thumbnail instead of a video
+ directly load the lowest bitrate in an adaptative bitrate video player
+ replace a dynamic Google Map by a static one
+ use an aggressive "cache then network" Service Worker strategy
+ switch your PWA to offline-first mode when the network gets really bad
+ show a "please wait" message on Ajax actions
+ reduce the frequency of network requests on autocomplete fields
+ avoid loading custom fonts
+ send customers to a faster competitor 😬
+ ... (add your ideas here)

But you can also think the other way 🔃 and enhance your website quality on high speed connections:
+ load beautiful HD images
+ automatically start videos
+ load more results at once
+ ... (add your ideas here)


## How to install?

### Step 1: Load howSlowForPage.js and instantiate it

Grab the howSlowForPage.js script, transpile it to ES5 (because it's written in ES6), and load it on the page whenever you want. But the sooner it's loaded, the sooner the service worker will be ready.

And just after it's loaded, you need to instantiate it with the path to the service worker.

```html
<script src="/scripts/howSlowForPage.js"></script>
<script>window.howslow = new HowSlowForPage('/mySW.js');</script>
```

### Step 2: Build the service worker and serve it at the root level

Grab the howSlowForSW.js script, rename it as you like (`mySW.js` in the above example) and serve it with at your website's root. You don't need to transpile the service worker's code, as Service Workers compatible browsers understand ES6.

### Step 3: Use the estimated bandwidth or RTT in your code

If you need the stats in the page's scope, they're available like this:

```js
if (howslow.getBandwidth() > 1000) { // Remember, bandwidth is in KBps (1 Kilo Bytes = 8 Kilo bits)
    videoPlayer.init();
}

if (howslow.getRTT() < 50) { // Roundtrip Time is in milliseconds
    loadThirdParties();
}
```

If you need them in the Service Worker's scope, they are available in the same way:

```js
howslow.getBandwidth()
howslow.getRTT()
```

You can write your own logic at the top of the current service worker script. What you can't do is write a fetch event listener as there can be only one. But you can use some hook functions: `urlRewritingHook` and `urlBlockingHook`. More details below.

If you want to keep your service worker's logic separated from howslow, you can use the importScripts() method. But that's one more request before the Service Workers is available.

```js
self.importScripts('howSlowForSW.js');

// ... and here is your own code
```

### The urlRewritingHook

Use this hook to rewrite the URL before the service workers sends the request. The function should return the new URL or `null` if no change is needed.

Here is an example that adds an `-hd` suffix to images on fast connections:

```js
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

// ... and here is the rest of the howSlowForSW.js script
```

### The urlBlockingHook

Use this hook to cancel the request before it's sent to network. Returning `true` will block the request, returning `false` will let it go.

Here is an example that blocks a third party script on slow connections:

```js
function urlBlockingHook(url) {
    return (url === 'https://thirdparty.com/tracker.js' && howslow.getBandwidth() < 50);
}
```

## Some coding examples

[Block a custom font on slow bandwidth](./examples/block-fonts/sw.js)

[Adjust density of responsive images according to bandwidth](./examples/adjust-image-density/page.html)

[Rewrite image URLs to add an "-hd" suffix](./examples/change-images-urls/sw.js)

[Block a third party script](./examples/block-third-parties/sw.js)

[Display a "Slow connection detected" message](./examples/show-connectivity-message/page.html)


## How are the averages calculated?

The algorithm uses "time weighted" averages: the most recent data has more weight than then old one. It is meant to provide a good compromise between reactivity and stability and to avoid the yo-yo effect.


## Will it work on the first page load?

The first time it's called, the Service Worker needs time to instantiate and initialize itself. For that reason, it only gets available after a few seconds and you might miss entirely the first page load. But it'll be ready for the next user action.

For returning visitors, HowSlow will first serve the last known values and adjust to the new bandwidth ASAP, in case it has changed in between.


## Ok, great. But what's the difference with the Network Information API?

The [Network Information API](https://developer.mozilla.org/en-US/docs/Web/API/NetworkInformation) is not yet mature and is only able to provide bandwidth/RTT estimations on Chrome Desktop. Smartphones are not supported.


## Compatibility

It's compatible with the latest versions of Chrome, Firefox and Safari. Unfortunately, Edge (v17) is not compatible. We're looking for a workaround.

However, Service Workers are quite unpredictable and you should not rely on this tool for important tasks. Use it for **progressive enhancement**.


## Demo

Demo page: https://fasterize.github.io/HowSlow/demo/demo.html

Mirror: https://gmetais.github.io/howslow/demo/demo.html


## Authors

The Fasterize team. [Fasterize](https://www.fasterize.com) is a frontend optimization platform that makes your website super-fast, super-easily.

