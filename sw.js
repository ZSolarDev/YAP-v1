importScripts("https://unpkg.com/@mercuryworkshop/scramjet-controller@0.0.14/dist/controller.sw.js");

addEventListener("fetch", (e) => {
    if ($scramjetController.shouldRoute(e)) {
        e.respondWith($scramjetController.route(e));
    }
});