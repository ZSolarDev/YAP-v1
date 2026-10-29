"use strict";

console.log("[INIT] index.js script loaded.");
console.log("[CONFIG] BACKEND set to:", BACKEND);

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

console.log("[DOM] Elements queried successfully.");

const { ScramjetController } = $scramjetLoadController();
console.log("[SCRAMJET] Controller loaded.");

const scramjet = new ScramjetController({
    files: {
        wasm: BACKEND + "/scram/scramjet.wasm.wasm",
        all: BACKEND + "/scram/scramjet.all.js",
        sync: BACKEND + "/scram/scramjet.sync.js",
    },
});

scramjet.init();
console.log("[SCRAMJET] Initialized.");

const connection = new BareMux.BareMuxConnection(BACKEND + "/baremux/worker.js");
console.log("[BAREMUX] Connection established.");

// Tab State Management
let tabs = [];
let activeTabId = null;

async function ensureBackendReady() {
    console.log("[BACKEND] ensureBackendReady() called.");
    try {
        console.log("[BACKEND] Registering Service Worker...");
        await registerSW();
        console.log("[BACKEND] Service Worker registered successfully.");
    } catch (err) {
        console.error("[BACKEND ERROR] Failed to register service worker:", err);
        error.textContent = "Failed to register service worker.";
        errorCode.textContent = err.toString();
        throw err;
    }

    let wispUrl = "ws://yep-v1.duckdns.org:8080/wisp/";
    console.log("[BACKEND] Setting Wisp transport URL:", wispUrl);

    const currentTransport = await connection.getTransport();
    console.log("[BACKEND] Current Bare-Mux transport:", currentTransport);

    const targetTransport = BACKEND + "/libcurl/index.mjs";
    if (currentTransport !== targetTransport) {
        console.log("[BACKEND] Setting transport to:", targetTransport);
        await connection.setTransport(targetTransport, [
            { websocket: wispUrl },
        ]);
        console.log("[BACKEND] Transport set successfully.");
    } else {
        console.log("[BACKEND] Transport already matches target.");
    }
}

function createNewTab(initialUrl = null) {
    console.log("[TABS] createNewTab() called with initialUrl:", initialUrl);
    const tabId = "tab-" + Date.now();
    
    console.log("[TABS] Creating Scramjet frame for tabId:", tabId);
    const frameObj = scramjet.createFrame();
    const frameEl = frameObj.frame;
    frameEl.className = "proxy-frame-instance";
    frameEl.id = tabId + "-frame";
    viewportContainer.appendChild(frameEl);

    const tabData = {
        id: tabId,
        title: "New Tab",
        url: "",
        frameObj: frameObj,
        frameEl: frameEl
    };

    tabs.push(tabData);
    console.log("[TABS] Tab object pushed. Total tabs:", tabs.length);

    renderTabDOM(tabData);
    switchTab(tabId);

    if (initialUrl) {
        console.log("[TABS] Navigating new tab to initialUrl:", initialUrl);
        navigateToUrl(tabId, initialUrl);
    }
}

function renderTabDOM(tabData) {
    console.log("[DOM] renderTabDOM() called for tabId:", tabData.id);
    const tabEl = document.createElement("div");
    tabEl.className = "browser-tab";
    tabEl.id = `dom-${tabData.id}`;
    tabEl.innerHTML = `
        <span class="tab-title">${tabData.title}</span>
        <button class="tab-close">×</button>
    `;

    tabEl.addEventListener("click", (e) => {
        console.log("[DOM] Tab clicked:", tabData.id);
        if (e.target.closest(".tab-close")) {
            console.log("[DOM] Close button clicked for tabId:", tabData.id);
            closeTab(tabData.id);
        } else {
            console.log("[DOM] Switching to tabId:", tabData.id);
            switchTab(tabData.id);
        }
    });

    tabsList.appendChild(tabEl);
    console.log("[DOM] Tab element appended to tabsList.");
}

function switchTab(tabId) {
    console.log("[TABS] switchTab() called for tabId:", tabId);
    activeTabId = tabId;

    document.querySelectorAll(".browser-tab").forEach(el => {
        el.classList.toggle("active", el.id === `dom-${tabId}`);
    });

    const activeTab = tabs.find(t => t.id === tabId);
    if (!activeTab || !activeTab.url) {
        console.log("[TABS] Active tab has no URL. Showing home view.");
        homeView.style.display = "flex";
        viewportContainer.style.display = "none";
        document.querySelectorAll(".proxy-frame-instance").forEach(f => f.classList.remove("active"));
        address.value = "";
    } else {
        console.log("[TABS] Active tab has URL:", activeTab.url, ". Showing viewport.");
        homeView.style.display = "none";
        viewportContainer.style.display = "block";
        document.querySelectorAll(".proxy-frame-instance").forEach(f => {
            f.classList.toggle("active", f.id === `${tabId}-frame`);
        });
        address.value = activeTab.url;
    }
}

function closeTab(tabId) {
    console.log("[TABS] closeTab() called for tabId:", tabId);
    const index = tabs.findIndex(t => t.id === tabId);
    if (index === -1) {
        console.log("[TABS ERROR] Tab not found to close:", tabId);
        return;
    }

    const tab = tabs[index];
    tab.frameEl.remove();
    document.getElementById(`dom-${tabId}`)?.remove();
    tabs.splice(index, 1);
    console.log("[TABS] Tab removed. Remaining tabs:", tabs.length);

    if (tabs.length === 0) {
        console.log("[TABS] No tabs left. Creating a new default tab.");
        createNewTab();
    } else if (activeTabId === tabId) {
        const nextTab = tabs[Math.max(0, index - 1)];
        console.log("[TABS] Switching to adjacent tabId:", nextTab.id);
        switchTab(nextTab.id);
    }
}

async function navigateToUrl(tabId, rawInput) {
    console.log("[NAV] navigateToUrl() called for tabId:", tabId, "with input:", rawInput);
    await ensureBackendReady();

    const targetUrl = search(rawInput, searchEngine.value);
    console.log("[NAV] Resolved targetUrl:", targetUrl);

    const tab = tabs.find(t => t.id === tabId);
    if (!tab) {
        console.log("[NAV ERROR] Tab not found for navigation:", tabId);
        return;
    }

    tab.url = targetUrl;
    tab.title = rawInput;
    
    const titleEl = document.querySelector(`#dom-${tabId} .tab-title`);
    if (titleEl) titleEl.textContent = rawInput;

    if (activeTabId === tabId) {
        console.log("[NAV] Active tab matches. Displaying viewport frame.");
        homeView.style.display = "none";
        viewportContainer.style.display = "block";
        document.querySelectorAll(".proxy-frame-instance").forEach(f => {
            f.classList.toggle("active", f.id === `${tabId}-frame`);
        });
        address.value = targetUrl;
    }

    console.log("[NAV] Instructing frameObj to go to URL:", targetUrl);
    tab.frameObj.go(targetUrl);
}

// Event Listeners
form.addEventListener("submit", async (event) => {
    console.log("[EVENT] Form submit intercepted.");
    event.preventDefault();
    const val = address.value.trim();
    console.log("[EVENT] Address input value:", val);
    if (!val) {
        console.log("[EVENT] Input is empty. Aborting submit.");
        return;
    }

    let targetTabId = activeTabId;
    if (!targetTabId || tabs.length === 0) {
        console.log("[EVENT] No active tab. Creating new tab for input.");
        createNewTab();
        targetTabId = tabs[tabs.length - 1].id;
    }

    navigateToUrl(targetTabId, val);
});

newTabBtn.addEventListener("click", () => {
    console.log("[EVENT] New tab button clicked.");
    createNewTab();
});

backBtn.addEventListener("click", () => {
    console.log("[EVENT] Back button clicked.");
    const activeTab = tabs.find(t => t.id === activeTabId);
    try { activeTab?.frameEl.contentWindow.history.back(); } catch (e) { console.error(e); }
});

forwardBtn.addEventListener("click", () => {
    console.log("[EVENT] Forward button clicked.");
    const activeTab = tabs.find(t => t.id === activeTabId);
    try { activeTab?.frameEl.contentWindow.history.forward(); } catch (e) { console.error(e); }
});

reloadBtn.addEventListener("click", () => {
    console.log("[EVENT] Reload button clicked.");
    const activeTab = tabs.find(t => t.id === activeTabId);
    try { 
        activeTab?.frameEl.contentWindow.location.reload(); 
    } catch (e) {
        if (activeTab?.frameObj) activeTab.frameObj.go(activeTab.url);
    }
});

// Initialize with a blank tab on load
window.addEventListener("DOMContentLoaded", () => {
    console.log("[EVENT] DOMContentLoaded fired in index.js.");
    if (tabs.length === 0) {
        createNewTab();
    }
});

// Expose globals for SVG wrapper fallback checks
window.createNewTab = createNewTab;
window.switchTab = switchTab;
window.closeTab = closeTab;

console.log("[INIT] index.js fully parsed and loaded.");