This is an in-browser bandwidth and RTT (roundtrip time) estimator based on a Service Worker and the Resource Timing API.


## How does it work?

Basicaly, the Service Worker includes an algorythm that reads previous [Resource Timing](https://developer.mozilla.org/en-US/docs/Web/API/Resource_Timing_API/Using_the_Resource_Timing_API), uses them to estimate the connectivity metrics and constantly adjusts them after every newly downloaded resource.

Estimated bandwidth and RTT are available both in the Service Worker and the JavaScript scope of the page for a large variety of behaviors.


## What is it good for?

Send some love ❤️ to your slower users:
+ load lower quality images
+ avoid loading some third parties such as ads, retargeting tags, AB Testing...
+ display a clickable thumbnail instead of a video
+ replace your dynamic map by a static one
+ use an aggressive "cache then network" Service Worker strategy
+ show a "please wait" message on Ajax actions
+ ... (add your ideas here)

But you can also think the other way 🔃 and enhance your website quality on high speed connections, load beautiful HD images, start videos...


## How to install?

### Step 1: 




## Will it work on the first page load?

The first time it's called, the Service Worker needs to instantiate and initialize itself. For that reason, it only gets available after a few seconds and you might miss entirely the first page load. But it'll be ready for the next page, or the next user action if it's a Single Page Application.


## Ok, great. But what's the difference with the Network Information API?

The [Network Information API](https://developer.mozilla.org/en-US/docs/Web/API/NetworkInformation) is not yet mature and is only able to provide bandwidth/RTT estimations on Chrome Desktop. Smartphones are not supported.


## Compatibility

It's compatible with the latest versions of Chrome, Firefox and Safari (v11.3). Unfortunately, Edge (v17) is not compatible. We're looking for a workaround.

However, Service Workers are quite unpredictable and you should not rely on this tool for important tasks. Use it for **progressive enhancement**.


## Authors

The Fasterize team. [Fasterize](https://www.fasterize.com/fr/) is an automatic frontend optimization platform. 

