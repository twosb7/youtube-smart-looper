(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
    return;
  }

  root.YouTubeSmartLooperBackground = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const CONTENT_SCRIPT_FILES = [
    "src/shared.js",
    "src/panel-runtime.js",
    "src/full-loop-runtime.js",
    "src/loop-engine.js",
    "src/content.js",
  ];

  function isInjectableYouTubeUrl(rawUrl) {
    if (!rawUrl || typeof rawUrl !== "string") {
      return false;
    }

    try {
      const url = new URL(rawUrl);
      const isYouTubeHost = url.hostname === "www.youtube.com" || url.hostname === "youtube.com";
      return isYouTubeHost && url.protocol === "https:" && url.pathname === "/watch";
    } catch (error) {
      return false;
    }
  }

  function createBackgroundRuntime(chromeApi) {
    const api = chromeApi || chrome;

    async function hasContentRuntime(tabId) {
      try {
        const results = await api.scripting.executeScript({
          target: { tabId: tabId },
          func: function () {
            return Boolean(globalThis.__youtubeSmartLooperContentRuntime);
          },
        });

        return Boolean(results && results[0] && results[0].result);
      } catch (error) {
        return false;
      }
    }

    async function injectIntoTab(tabId) {
      await api.scripting.executeScript({
        target: { tabId: tabId },
        files: CONTENT_SCRIPT_FILES,
      });
    }

    async function ensureTabInjected(tab) {
      if (!tab || typeof tab.id !== "number" || !isInjectableYouTubeUrl(tab.url)) {
        return false;
      }

      try {
        if (await hasContentRuntime(tab.id)) {
          return false;
        }

        await injectIntoTab(tab.id);
        return true;
      } catch (error) {
        console.warn("[YouTube Smart Looper] Failed to inject content scripts.", error);
        return false;
      }
    }

    async function ensureOpenYouTubeTabsInjected() {
      const tabs = await api.tabs.query({
        url: ["https://www.youtube.com/watch*", "https://youtube.com/watch*"],
      });

      await Promise.all(tabs.map(ensureTabInjected));
    }

    function attach() {
      api.runtime.onInstalled.addListener(() => {
        void ensureOpenYouTubeTabsInjected();
      });

      api.runtime.onStartup.addListener(() => {
        void ensureOpenYouTubeTabsInjected();
      });

      api.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
        if (changeInfo.status !== "complete") {
          return;
        }

        void ensureTabInjected(Object.assign({}, tab, { id: tabId }));
      });

      api.tabs.onActivated.addListener(async (activeInfo) => {
        const tab = await api.tabs.get(activeInfo.tabId);
        void ensureTabInjected(tab);
      });
    }

    return {
      attach,
      hasContentRuntime,
      ensureTabInjected,
      ensureOpenYouTubeTabsInjected,
    };
  }

  return {
    CONTENT_SCRIPT_FILES,
    isInjectableYouTubeUrl,
    createBackgroundRuntime,
  };
});

if (typeof chrome !== "undefined" && chrome.runtime && chrome.scripting && chrome.tabs) {
  const background = globalThis.YouTubeSmartLooperBackground.createBackgroundRuntime(chrome);
  background.attach();
}
