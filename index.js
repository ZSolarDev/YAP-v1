"use strict";

console.log("[INIT] Scramjet v2 index.js loaded.");

import LibcurlClient from "https://yap-v1.loophole.site/libcurl/index.mjs";
import { defaultConfigDev } from "https://yap-v1.loophole.site/scram/scramjet.js";
import { Controller } from "https://yap-v1.loophole.site/controller/controller.api.js";

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

// Helper function to resolve search vs direct URL input
function search(input, template) {
    try {
        new URL(input);
        return input;
    } catch (_) {
        // Not a valid URL, treat as search query
        if (!input.includes(".") || input.includes(" ")) {
            return template.replace("%s", encodeURIComponent(input));
        }
        return "https://" + input;
    }
}

async function ensureBackendReady() {
    if (controller) return;

    console.log("[BACKEND] Initializing Scramjet v2 Controller & Transport...");
    try {
        const wispUrl = "wss://yap-v1.loophole.site/wisp/";
        const transport = new LibcurlClient({ wisp: wispUrl });

        controller = new Controller({
            serviceworker: BACKEND + "/sw.js",
            transport: transport,
            scramjetConfig: defaultConfigDev,
        });

        await controller.wait();
        console.log("[CONTROLLER] Scramjet v2 initialized successfully!");
    } catch (err) {
        console.error("[BACKEND ERROR] Failed to initialize Scramjet v2:", err);
        error.textContent = "Failed to initialize Scramjet v2 controller.";
        errorCode.textContent = err.toString();
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
        address.value = "";
    } else {
        homeView.style.display = "none";
        viewportContainer.style.display = "block";
        address.value = activeTab.url;
    }
}

function closeTab(tabId) {
    const index = tabs.findIndex(t => t.id === tabId);
    if (index === -1) return;
    tabs[index].frameEl.remove();
    document.getElementById(`dom-${tabId}`)?.remove();
    tabs.splice(index, 1);
    if (tabs.length === 0) createNewTab();
    else if (activeTabId === tabId) switchTab(tabs[Math.max(0, index - 1)].id);
}

async function navigateToUrl(tabId, rawInput) {
    await ensureBackendReady();
    const targetUrl = search(rawInput, searchEngine.value);
    const tab = tabs.find(t => t.id === tabId);
    if (!tab) return;

    tab.url = targetUrl;
    tab.title = rawInput;
    document.querySelector(`#dom-${tabId} .tab-title`).textContent = rawInput;
    tab.frameObj.go(targetUrl);
}

form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const val = address.value.trim();
    if (!val) return;
    let targetTabId = activeTabId || (await createNewTab(), tabs[tabs.length - 1].id);
    navigateToUrl(targetTabId, val);
});

newTabBtn.addEventListener("click", () => createNewTab());
window.addEventListener("DOMContentLoaded", () => { if (tabs.length === 0) createNewTab(); });

window.createNewTab = createNewTab;
window.switchTab = switchTab;
window.closeTab = closeTab;