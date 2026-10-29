"use strict";

console.log("[INIT] Scramjet v2 index.js loaded.");

import LibcurlClient from "https://cdn.jsdelivr.net/npm/@mercuryworkshop/libcurl-transport/+esm";

const BACKEND = "https://yap-v1.loophole.site";

const form = document.getElementById("sj-form");
const address = document.getElementById("sj-address");
const searchEngine = document.getElementById("sj-search-engine");
const error = document.getElementById("sj-error");
const errorCode = document.getElementById("sj-error-code");

const homeView = document.getElementById("home-view");
const viewportContainer = document.getElementById("viewport-container");
const tabsList = document.getElementById("tabs-list");
const newTabBtn = document.getElementById("new-tab-btn");

const backBtn = document.getElementById("back-btn");
const forwardBtn = document.getElementById("forward-btn");
const reloadBtn = document.getElementById("reload-btn");

let controller = null;
let tabs = [];
let activeTabId = null;

function search(input, template) {
    try {
        new URL(input);
        return input;
    } catch (_) {
        if (!input.includes(".") || input.includes(" ")) {
            return template.replace("%s", encodeURIComponent(input));
        }
        return "https://" + input;
    }
}

async function ensureBackendReady() {
    if (controller) {
        console.log("[DIAGNOSTIC] ensureBackendReady: Controller already exists, returning cached instance.");
        return;
    }

    console.log("[BACKEND] Initializing Scramjet v2 Controller & Transport...");
    try {
        console.log("[DIAGNOSTIC] Checking navigator.serviceWorker availability...");
        if ("serviceWorker" in navigator) {
            console.log("[DIAGNOSTIC] serviceWorker is supported. Registering script:", BACKEND + "/sw.js");
            const reg = await navigator.serviceWorker.register(BACKEND + "/sw.js", { scope: "/" });
            console.log("[DIAGNOSTIC] ServiceWorker registration object returned:", reg);
            console.log("[DIAGNOSTIC] Waiting for navigator.serviceWorker.ready...");
            await navigator.serviceWorker.ready;
            console.log("[DIAGNOSTIC] navigator.serviceWorker.ready resolved.");

            console.log("[DIAGNOSTIC] Current navigator.serviceWorker.controller:", navigator.serviceWorker.controller);
            console.log("[DIAGNOSTIC] reg.active:", reg.active);

            if (!navigator.serviceWorker.controller && reg.active) {
                console.warn("[DIAGNOSTIC] Warning: Worker is active but navigator.serviceWorker.controller is null.");
                if (!sessionStorage.getItem("sj_reloaded")) {
                    console.log("[DIAGNOSTIC] Setting session flag and triggering reload to bind controller...");
                    sessionStorage.setItem("sj_reloaded", "true");
                    window.location.reload();
                    return;
                } else {
                    console.log("[DIAGNOSTIC] Reload flag already set. Proceeding anyway...");
                }
            }
        } else {
            console.warn("[DIAGNOSTIC] serviceWorker NOT supported in navigator!");
        }

        const wispUrl = "wss://yap-v1.loophole.site/wisp/";
        console.log("[DIAGNOSTIC] Initializing LibcurlClient with wisp URL:", wispUrl);
        const transport = new LibcurlClient({ wisp: wispUrl });
        console.log("[DIAGNOSTIC] LibcurlClient initialized:", transport);

        console.log("[DIAGNOSTIC] Checking window.$scramjetController:", window.$scramjetController);
        if (!window.$scramjetController || !window.$scramjetController.Controller) {
            throw new Error("window.$scramjetController or Controller class is missing/undefined!");
        }
        const { Controller } = window.$scramjetController;

        console.log("[DIAGNOSTIC] Checking window.$scramjet:", window.$scramjet);
        const scramjetConfig = window.$scramjet ? window.$scramjet.defaultConfig : {};
        console.log("[DIAGNOSTIC] Resolved scramjetConfig:", scramjetConfig);

        const assetFiles = {
            wasm: "https://unpkg.com/@mercuryworkshop/scramjet@2.0.67-alpha.2/dist/scramjet.wasm",
            worker: "https://unpkg.com/@mercuryworkshop/scramjet@2.0.67-alpha.2/dist/scramjet.worker.js",
            client: "https://unpkg.com/@mercuryworkshop/scramjet@2.0.67-alpha.2/dist/scramjet.client.js",
        };
        console.log("[DIAGNOSTIC] Explicit asset files mapping:", assetFiles);

        scramjetConfig.files = assetFiles;

        const controllerOptions = {
            serviceworker: BACKEND + "/sw.js",
            transport: transport,
            config: {
                scramjetPath: "https://unpkg.com/@mercuryworkshop/scramjet@2.0.67-alpha.2/dist/scramjet.js",
                wasmPath: "https://unpkg.com/@mercuryworkshop/scramjet@2.0.67-alpha.2/dist/scramjet.wasm",
                injectPath: "https://unpkg.com/@mercuryworkshop/scramjet-controller@0.0.14/dist/controller.inject.js",
            },
            scramjetConfig: scramjetConfig,
        };
        console.log("[DIAGNOSTIC] Instantiating new Controller with options:", controllerOptions);

        controller = new Controller(controllerOptions);
        console.log("[DIAGNOSTIC] Controller instance created successfully:", controller);

        console.log("[DIAGNOSTIC] Awaiting controller.wait()...");
        await controller.wait();
        console.log("[CONTROLLER] Scramjet v2 initialized and waited successfully!");
    } catch (err) {
        console.error("[BACKEND ERROR] Detailed failure inside ensureBackendReady:", err);
        console.error("[BACKEND ERROR] Error name:", err.name);
        console.error("[BACKEND ERROR] Error message:", err.message);
        console.error("[BACKEND ERROR] Error stack:", err.stack);
        error.textContent = "Failed to initialize Scramjet v2 controller.";
        errorCode.textContent = err.toString() + "\n\nStack:\n" + (err.stack || "");
        throw err;
    }
}

async function createNewTab(initialUrl = null) {
    await ensureBackendReady();
    const tabId = "tab-" + Date.now();

    const frameObj = controller.createFrame();
    const frameEl = frameObj.frame;
    frameEl.className = "proxy-frame-instance";
    frameEl.id = tabId + "-frame";
    viewportContainer.appendChild(frameEl);

    const tabData = { id: tabId, title: "New Tab", url: "", frameObj, frameEl };
    tabs.push(tabData);
    renderTabDOM(tabData);
    switchTab(tabId);

    if (initialUrl) navigateToUrl(tabId, initialUrl);
}

function renderTabDOM(tabData) {
    const tabEl = document.createElement("div");
    tabEl.className = "browser-tab";
    tabEl.id = `dom-${tabData.id}`;
    tabEl.innerHTML = `<span class="tab-title">${tabData.title}</span><button class="tab-close">×</button>`;
    tabEl.addEventListener("click", (e) => {
        if (e.target.closest(".tab-close")) closeTab(tabData.id);
        else switchTab(tabData.id);
    });
    tabsList.appendChild(tabEl);
}

function switchTab(tabId) {
    activeTabId = tabId;
    document.querySelectorAll(".browser-tab").forEach(el => {
        el.classList.toggle("active", el.id === `dom-${tabId}`);
    });

    const activeTab = tabs.find(t => t.id === tabId);
    if (!activeTab || !activeTab.url) {
        homeView.style.display = "flex";
        viewportContainer.style.display = "none";
        document.querySelectorAll(".proxy-frame-instance").forEach(f => f.classList.remove("active"));
        address.value = "";
    } else {
        homeView.style.display = "none";
        viewportContainer.style.display = "block";
        document.querySelectorAll(".proxy-frame-instance").forEach(f => {
            f.classList.toggle("active", f.id === `${tabId}-frame`);
        });
        address.value = activeTab.url;
    }
}

function closeTab(tabId) {
    const index = tabs.findIndex(t => t.id === tabId);
    if (index === -1) return;

    const tab = tabs[index];
    tab.frameEl.remove();
    document.getElementById(`dom-${tabId}`)?.remove();
    tabs.splice(index, 1);

    if (tabs.length === 0) {
        createNewTab();
    } else if (activeTabId === tabId) {
        const nextTab = tabs[Math.max(0, index - 1)];
        switchTab(nextTab.id);
    }
}

async function navigateToUrl(tabId, rawInput) {
    await ensureBackendReady();
    const targetUrl = search(rawInput, searchEngine.value);
    const tab = tabs.find(t => t.id === tabId);
    if (!tab) return;

    tab.url = targetUrl;
    tab.title = rawInput;

    const titleEl = document.querySelector(`#dom-${tabId} .tab-title`);
    if (titleEl) titleEl.textContent = rawInput;

    if (activeTabId === tabId) {
        homeView.style.display = "none";
        viewportContainer.style.display = "block";
        document.querySelectorAll(".proxy-frame-instance").forEach(f => {
            f.classList.toggle("active", f.id === `${tabId}-frame`);
        });
        address.value = targetUrl;
    }

    tab.frameObj.go(targetUrl);
}

form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const val = address.value.trim();
    if (!val) return;

    let targetTabId = activeTabId;
    if (!targetTabId || tabs.length === 0) {
        await createNewTab();
        targetTabId = tabs[tabs.length - 1].id;
    }
    navigateToUrl(targetTabId, val);
});

newTabBtn.addEventListener("click", () => createNewTab());

backBtn.addEventListener("click", () => {
    const activeTab = tabs.find(t => t.id === activeTabId);
    try { activeTab?.frameEl.contentWindow.history.back(); } catch (e) {}
});

forwardBtn.addEventListener("click", () => {
    const activeTab = tabs.find(t => t.id === activeTabId);
    try { activeTab?.frameEl.contentWindow.history.forward(); } catch (e) {}
});

reloadBtn.addEventListener("click", () => {
    const activeTab = tabs.find(t => t.id === activeTabId);
    try { 
        activeTab?.frameEl.contentWindow.location.reload(); 
    } catch (e) {
        if (activeTab?.frameObj) activeTab.frameObj.go(activeTab.url);
    }
});

window.addEventListener("DOMContentLoaded", () => {
    if (tabs.length === 0) {
        createNewTab();
    }
});

window.createNewTab = createNewTab;
window.switchTab = switchTab;
window.closeTab = closeTab;

console.log("[INIT] index.js fully parsed and loaded.");