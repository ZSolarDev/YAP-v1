"use strict";

const BACKEND = "http://yep-v1.duckdns.org:8080";

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

const { ScramjetController } = $scramjetLoadController();

// Point Scramjet files directly to your home server backend
const scramjet = new ScramjetController({
    files: {
        wasm: BACKEND + "/scram/scramjet.wasm.wasm",
        all: BACKEND + "/scram/scramjet.all.js",
        sync: BACKEND + "/scram/scramjet.sync.js",
    },
});

scramjet.init();

// Point Bare-Mux worker directly to your home server backend
const connection = new BareMux.BareMuxConnection(BACKEND + "/baremux/worker.js");

// Tab State Management
let tabs = [];
let activeTabId = null;

async function ensureBackendReady() {
    try {
        await registerSW();
    } catch (err) {
        error.textContent = "Failed to register service worker.";
        errorCode.textContent = err.toString();
        throw err;
    }

    let wispUrl = "ws://yep-v1.duckdns.org:8080/wisp/";

    // Point Libcurl transport to your backend
    if ((await connection.getTransport()) !== BACKEND + "/libcurl/index.mjs") {
        await connection.setTransport(BACKEND + "/libcurl/index.mjs", [
            { websocket: wispUrl },
        ]);
    }
}

function createNewTab(initialUrl = null) {
	const tabId = "tab-" + Date.now();
	
	// Create Scramjet frame element
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
	renderTabDOM(tabData);
	switchTab(tabId);

	if (initialUrl) {
		navigateToUrl(tabId, initialUrl);
	}
}

function renderTabDOM(tabData) {
	const tabEl = document.createElement("div");
	tabEl.className = "browser-tab";
	tabEl.id = `dom-${tabData.id}`;
	tabEl.innerHTML = `
		<span class="tab-title">${tabData.title}</span>
		<button class="tab-close"><i class="fa-solid fa-xmark"></i></button>
	`;

	tabEl.addEventListener("click", (e) => {
		if (e.target.closest(".tab-close")) {
			closeTab(tabData.id);
		} else {
			switchTab(tabData.id);
		}
	});

	tabsList.appendChild(tabEl);
}

function switchTab(tabId) {
	activeTabId = tabId;

	// Update tab active states
	document.querySelectorAll(".browser-tab").forEach(el => {
		el.classList.toggle("active", el.id === `dom-${tabId}`);
	});

	const activeTab = tabs.find(t => t.id === tabId);
	if (!activeTab || !activeTab.url) {
		// Show Home View / New Tab Page
		homeView.style.display = "flex";
		viewportContainer.style.display = "none";
		document.querySelectorAll(".proxy-frame-instance").forEach(f => f.classList.remove("active"));
		address.value = "";
	} else {
		// Show Proxy Viewport
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
	
	// Update tab header label
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

// Event Listeners
form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const val = address.value.trim();
    if (!val) return;

    // If we have an active tab, use it; otherwise create a new one
    let targetTabId = activeTabId;
    if (!targetTabId || tabs.length === 0) {
        createNewTab();
        targetTabId = tabs[tabs.length - 1].id;
    }

    navigateToUrl(targetTabId, val);
});

newTabBtn.addEventListener("click", () => {
	createNewTab();
});

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
	try { activeTab?.frameEl.contentWindow.location.reload(); } catch (e) {
		if (activeTab?.frameObj) activeTab.frameObj.go(activeTab.url);
	}
});

// Initialize with a blank tab on load
window.addEventListener("DOMContentLoaded", () => {
	createNewTab();
});

window.createNewTab = createNewTab;
window.switchTab = switchTab;
window.closeTab = closeTab;