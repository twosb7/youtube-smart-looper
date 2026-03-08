(function () {
  const shared = globalThis.YouTubeSmartLooperShared;

  if (!shared) {
    return;
  }

  const elements = {
    statusText: document.getElementById("statusText"),
    videoIdValue: document.getElementById("videoIdValue"),
    loopValue: document.getElementById("loopValue"),
    panelPlacementValue: document.getElementById("panelPlacementValue"),
  };

  const popupState = {
    activeTabId: null,
    loopState: null,
    isBusy: false,
  };

  function setBusy(isBusy) {
    popupState.isBusy = isBusy;
    render();
  }

  function queryActiveTab() {
    return new Promise((resolve) => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        resolve(tabs && tabs.length ? tabs[0] : null);
      });
    });
  }

  function sendToActiveTab(message) {
    if (popupState.activeTabId === null) {
      return Promise.resolve({ ok: false, error: "No active tab." });
    }

    return new Promise((resolve) => {
      chrome.tabs.sendMessage(popupState.activeTabId, message, (response) => {
        if (chrome.runtime.lastError) {
          resolve({ ok: false, error: chrome.runtime.lastError.message });
          return;
        }

        resolve(response || { ok: false, error: "No response." });
      });
    });
  }

  function getStatusText() {
    const state = popupState.loopState;

    if (popupState.isBusy) {
      return "Checking current tab...";
    }

    if (!state) {
      return "Open a YouTube watch page. Primary controls appear in the player controls.";
    }

    if (!state.isWatchPage) {
      return "This tab is not a YouTube watch page.";
    }

    if (!state.hasVideo) {
      return "Waiting for the YouTube player to finish loading.";
    }

    return state.fullLoopEnabled
      ? "Full-video loop is enabled for this video."
      : "Use the Smart Loop icons in the YouTube player controls.";
  }

  function render() {
    const state = popupState.loopState;

    elements.statusText.textContent = getStatusText();
    elements.videoIdValue.textContent = state && state.videoId ? state.videoId : "-";
    elements.loopValue.textContent = state && state.fullLoopEnabled ? "Enabled" : "Off";
    elements.panelPlacementValue.textContent = state && state.panelPlacement ? state.panelPlacement : "-";
  }

  async function refreshState() {
    setBusy(true);
    const response = await sendToActiveTab({ type: shared.MESSAGE_TYPES.GET_LOOP_STATE });
    popupState.loopState = response.ok ? response.state : null;
    setBusy(false);
  }

  async function init() {
    const activeTab = await queryActiveTab();
    popupState.activeTabId = activeTab && typeof activeTab.id === "number" ? activeTab.id : null;
    await refreshState();
  }

  render();
  void init();
})();
