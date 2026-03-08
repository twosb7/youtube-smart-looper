(function () {
  const shared = globalThis.YouTubeSmartLooperShared;
  const panelRuntime = globalThis.YouTubeSmartLooperPanelRuntime;
  const fullLoopRuntime = globalThis.YouTubeSmartLooperFullLoopRuntime;
  const loopEngine = globalThis.YouTubeSmartLooperLoopEngine;

  if (!shared || !panelRuntime || !fullLoopRuntime || !loopEngine) {
    console.warn("[YouTube Smart Looper] required runtime utilities are unavailable.");
    return;
  }

  if (globalThis.__youtubeSmartLooperContentRuntime) {
    globalThis.__youtubeSmartLooperContentRuntime.destroy();
  }

  const HREF_POLL_INTERVAL_MS = 500;
  const VIDEO_MONITOR_INTERVAL_MS = 1000;
  const MUTATION_DEBOUNCE_MS = 150;
  const FULL_LOOP_WRAP_THRESHOLD_SECONDS = 0.2;
  const CONTROL_HOST_ID = "youtube-smart-looper-root";

  const runtime = {
    currentUrl: location.href,
    currentVideoId: shared.parseVideoIdFromUrl(location.href),
    persistedState: shared.createDefaultState(),
    currentVideo: null,
    refreshToken: 0,
    isDestroyed: false,
    navigationWatchersAttached: false,
    hrefPollTimer: null,
    videoMonitorTimer: null,
    mutationObserver: null,
    mutationDebounceTimer: null,
    controlHost: null,
    controlShadowRoot: null,
    controlPlacement: "hidden",
    controlElements: null,
    controlAnchor: null,
    controlContainer: null,
    abPopoverHost: null,
    abPopoverShadowRoot: null,
    abPopoverElements: null,
    debugStatus: "boot",
    debugStatusText: "",
    isTogglePending: false,
    isProgrammaticWrapInProgress: false,
    openPopover: "",
    shouldCloseAbPopoverOnLeave: false,
  };

  function debugLog(message, details) {
    if (typeof details === "undefined") {
      console.log("[YouTube Smart Looper]", message);
      return;
    }

    console.log("[YouTube Smart Looper]", message, details);
  }

  function setDebugStatus(status, details) {
    const nextText = details ? "YSL " + status + " " + details : "YSL " + status;
    if (runtime.debugStatusText === nextText) {
      return;
    }

    runtime.debugStatus = status;
    runtime.debugStatusText = nextText;

    debugLog(status, details);
  }

  function getStorageArea() {
    return chrome.storage.local;
  }

  function getCurrentVideoElement() {
    const video = document.querySelector("video");
    return video instanceof HTMLVideoElement ? video : null;
  }

  function getCurrentDuration() {
    return runtime.currentVideo && Number.isFinite(runtime.currentVideo.duration)
      ? runtime.currentVideo.duration
      : null;
  }

  function getSliderDurationLimit() {
    const duration = getCurrentDuration();

    if (!Number.isFinite(duration) || duration <= 0) {
      return null;
    }

    return Math.max(0, Math.floor(duration));
  }

  function getAbPopoverControlPair(kind) {
    if (!runtime.abPopoverElements) {
      return null;
    }

    return kind === "start"
      ? {
          input: runtime.abPopoverElements.startInput,
          slider: runtime.abPopoverElements.startSlider,
        }
      : {
          input: runtime.abPopoverElements.endInput,
          slider: runtime.abPopoverElements.endSlider,
        };
  }

  function getAbStateValue(kind) {
    return kind === "start" ? runtime.persistedState.startTime : runtime.persistedState.endTime;
  }

  function getDisplayedLoopCount(state) {
    const loopLimit = Number(state && state.loopLimit);
    if (!Number.isFinite(loopLimit) || loopLimit < 0) {
      return null;
    }

    return Math.floor(loopLimit);
  }

  function clampAbTimeToDuration(value) {
    const duration = getCurrentDuration();

    if (!Number.isFinite(value)) {
      return null;
    }

    if (duration && Number.isFinite(duration)) {
      return Math.min(Math.max(value, 0), duration);
    }

    return Math.max(value, 0);
  }

  function readPersistedState(videoId) {
    if (!videoId) {
      return Promise.resolve(shared.createDefaultState());
    }

    const key = shared.makeStorageKey(videoId);

    return new Promise((resolve) => {
      getStorageArea().get(key, (result) => {
        if (chrome.runtime.lastError) {
          console.warn("[YouTube Smart Looper] Failed to read loop state.", chrome.runtime.lastError);
          resolve(shared.createDefaultState());
          return;
        }

        resolve(result[key] || shared.createDefaultState());
      });
    });
  }

  function writePersistedState(videoId, state) {
    if (!videoId) {
      return Promise.resolve();
    }

    const key = shared.makeStorageKey(videoId);
    const payload = {};
    payload[key] = {
      fullLoopEnabled: Boolean(state.fullLoopEnabled),
      abLoopEnabled: Boolean(state.abLoopEnabled),
      startTime: state.startTime,
      endTime: state.endTime,
      loopLimit: state.loopLimit,
      updatedAt: Date.now(),
    };

    return new Promise((resolve) => {
      getStorageArea().set(payload, () => {
        if (chrome.runtime.lastError) {
          console.warn("[YouTube Smart Looper] Failed to write loop state.", chrome.runtime.lastError);
        }

        resolve();
      });
    });
  }

  function normalizeRuntimeState() {
    runtime.persistedState = shared.normalizePersistedState(runtime.persistedState, {
      duration: getCurrentDuration(),
    });
  }

  function applyInitialLoopOffState(state) {
    if (!state) {
      return shared.createDefaultState();
    }

    return Object.assign({}, state, {
      fullLoopEnabled: false,
      abLoopEnabled: false,
      completedLoops: 0,
    });
  }

  function buildStateSnapshot() {
    return {
      isWatchPage: Boolean(runtime.currentVideoId),
      hasVideo: Boolean(runtime.currentVideo),
      videoId: runtime.currentVideoId,
      fullLoopEnabled: runtime.persistedState.fullLoopEnabled,
      abLoopEnabled: runtime.persistedState.abLoopEnabled,
      startTime: runtime.persistedState.startTime,
      endTime: runtime.persistedState.endTime,
      loopLimit: runtime.persistedState.loopLimit,
      completedLoops: runtime.persistedState.completedLoops,
      activeLoopMode: loopEngine.getActiveLoopMode(runtime.persistedState),
      hasValidAbLoop: loopEngine.hasValidAbLoop(runtime.persistedState),
      panelPlacement: runtime.controlPlacement,
    };
  }

  function persistCurrentState() {
    return writePersistedState(runtime.currentVideoId, runtime.persistedState);
  }

  function detachVideoListeners(video) {
    if (!video) {
      return;
    }

    video.removeEventListener("timeupdate", handleVideoTimeUpdate);
    video.removeEventListener("ended", handleVideoEnded);
    video.removeEventListener("loadedmetadata", handleVideoMetadata);
    video.removeEventListener("durationchange", handleVideoMetadata);
  }

  function clearCurrentVideo() {
    if (runtime.currentVideo) {
      setDebugStatus("video:detach");
    }

    detachVideoListeners(runtime.currentVideo);
    runtime.currentVideo = null;
  }

  function applyLoopSettingsToCurrentVideo() {
    if (!runtime.currentVideo) {
      return;
    }

    const activeMode = loopEngine.getActiveLoopMode(runtime.persistedState);
    const loopLimit = loopEngine.getNormalizedLoopLimit(runtime.persistedState);
    const useNativeLoop = activeMode === "full" && loopLimit === null;

    fullLoopRuntime.syncNativeLoop(runtime.currentVideo, useNativeLoop);
  }

  function attachVideoListeners(video) {
    if (!video || video === runtime.currentVideo) {
      return;
    }

    clearCurrentVideo();
    runtime.currentVideo = video;
    setDebugStatus("video:attach", "duration=" + shared.formatTime(video.duration));
    applyLoopSettingsToCurrentVideo();
    video.addEventListener("timeupdate", handleVideoTimeUpdate);
    video.addEventListener("ended", handleVideoEnded);
    video.addEventListener("loadedmetadata", handleVideoMetadata);
    video.addEventListener("durationchange", handleVideoMetadata);
  }

  function handleVideoMetadata() {
    setDebugStatus("video:metadata", "duration=" + shared.formatTime(getCurrentDuration()));
    normalizeRuntimeState();
    applyLoopSettingsToCurrentVideo();
    void persistCurrentState();
    updateControls();
  }

  function handleVideoTimeUpdate() {
    if (!runtime.currentVideo || runtime.isProgrammaticWrapInProgress) {
      return;
    }

    if (!loopEngine.shouldHandleWrapInTimeupdate(runtime.persistedState)) {
      return;
    }

    const targetTime = loopEngine.getWrapTarget({
      state: runtime.persistedState,
      currentTime: runtime.currentVideo.currentTime,
      duration: runtime.currentVideo.duration,
      thresholdSeconds: FULL_LOOP_WRAP_THRESHOLD_SECONDS,
    });

    if (!Number.isFinite(targetTime)) {
      return;
    }

    setDebugStatus("loop:wrap", "mode=" + loopEngine.getActiveLoopMode(runtime.persistedState));

    runtime.isProgrammaticWrapInProgress = true;
    void fullLoopRuntime.restartVideoAtTime(runtime.currentVideo, targetTime).catch(() => {});

    const activeMode = loopEngine.getActiveLoopMode(runtime.persistedState);
    const previousEnabled = runtime.persistedState.fullLoopEnabled;
    const previousLoopLimit = runtime.persistedState.loopLimit;
    runtime.persistedState = loopEngine.recordLoopIteration(runtime.persistedState);
    applyLoopSettingsToCurrentVideo();
    updateControls();

    if (
      runtime.persistedState.fullLoopEnabled !== previousEnabled ||
      runtime.persistedState.loopLimit !== previousLoopLimit ||
      activeMode === "ab"
    ) {
      void persistCurrentState();
    }

    setTimeout(() => {
      runtime.isProgrammaticWrapInProgress = false;
    }, 60);
  }

  function handleVideoEnded() {
    if (!runtime.currentVideo || !runtime.persistedState.fullLoopEnabled || runtime.isProgrammaticWrapInProgress) {
      return;
    }

    const activeMode = loopEngine.getActiveLoopMode(runtime.persistedState);
    const loopLimit = loopEngine.getNormalizedLoopLimit(runtime.persistedState);

    if (loopLimit === 0) {
      const duration = Number(runtime.currentVideo.duration);
      const currentTime = Number(runtime.currentVideo.currentTime);

      if (
        Number.isFinite(duration) &&
        Number.isFinite(currentTime) &&
        currentTime < Math.max(0, duration - FULL_LOOP_WRAP_THRESHOLD_SECONDS)
      ) {
        return;
      }

      runtime.persistedState.fullLoopEnabled = false;
      runtime.persistedState.loopLimit = null;
      applyLoopSettingsToCurrentVideo();
      updateControls();
      void persistCurrentState();
      return;
    }

    if (activeMode === "full" && loopLimit === null) {
      return;
    }

    const targetTime = loopEngine.getWrapTarget({
      state: runtime.persistedState,
      currentTime: runtime.currentVideo.duration,
      duration: runtime.currentVideo.duration,
      thresholdSeconds: 0,
    });

    if (Number.isFinite(targetTime)) {
      void fullLoopRuntime.restartVideoAtTime(runtime.currentVideo, targetTime).catch(() => {});
    }
  }

  function chooseControlBarMountTarget(video) {
    if (!video) {
      debugLog("mount target unavailable: missing video");
      return null;
    }

    const player = video.closest(".html5-video-player");
    if (!(player instanceof HTMLElement)) {
      debugLog("mount target unavailable: missing .html5-video-player");
      return null;
    }

    const rightControls = player.querySelector(".ytp-right-controls");
    if (!(rightControls instanceof HTMLElement)) {
      debugLog("mount target unavailable: missing .ytp-right-controls");
      return null;
    }

    const preferredSelectors = [
      ".ytp-subtitles-button",
      ".ytp-settings-button",
      ".ytp-miniplayer-button",
      ".ytp-size-button",
      ".ytp-fullscreen-button",
    ];

    let anchor = null;
    let container = rightControls;
    for (const selector of preferredSelectors) {
      const match = rightControls.querySelector(selector);
      if (!(match instanceof HTMLElement)) {
        continue;
      }

      const matchRect = match.getBoundingClientRect();
      const computedStyle = window.getComputedStyle(match);
      if (
        matchRect.width < 20 ||
        matchRect.height < 20 ||
        computedStyle.display === "none" ||
        computedStyle.visibility === "hidden"
      ) {
        continue;
      }

      const parentContainer = match.parentElement;
      if (parentContainer instanceof HTMLElement && rightControls.contains(parentContainer)) {
        anchor = match;
        container = parentContainer;
        break;
      }
    }

    if (!(anchor instanceof HTMLElement)) {
      return null;
    }

    return {
      placement: "control-bar",
      anchor: anchor,
      container: container,
    };
  }

  function createControlHost() {
    const host = document.createElement("div");
    host.id = CONTROL_HOST_ID;
    host.setAttribute("data-youtube-smart-looper", "true");
    return host;
  }

  function createIcon(name) {
    if (name === "loop") {
      return `
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M7 7.5h9.2" />
          <path d="M13.7 4.8 19 7.5l-5.3 2.7" />
          <path d="M17 16.5H7.8" />
          <path d="M10.3 19.2 5 16.5l5.3-2.7" />
          <path d="M5 11.4A3.9 3.9 0 0 1 8.9 7.5" />
          <path d="M19 12.6A3.9 3.9 0 0 1 15.1 16.5" />
        </svg>
      `;
    }

    if (name === "ab") {
      return `
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M6 5.5v13" />
          <path d="M18 5.5v13" />
          <path d="M8.5 9.2h7" />
          <path d="m12.7 6.7 2.8 2.5-2.8 2.5" />
          <path d="M15.5 14.8h-7" />
          <path d="m11.3 17.3-2.8-2.5 2.8-2.5" />
        </svg>
      `;
    }

    return `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="8" />
      </svg>
    `;
  }

  function createControlMarkup(shadowRoot) {
    shadowRoot.innerHTML = `
      <style>
        :host {
          color-scheme: dark;
          display: flex;
          align-self: stretch;
          align-items: center;
          height: 38px;
          vertical-align: top;
        }

        .toolbar {
          position: relative;
          display: inline-flex;
          align-items: center;
          height: 38px;
          gap: 0;
          padding: 0;
          pointer-events: auto;
          transform: translateY(3px);
        }

        .icon-button {
          position: relative;
          flex: 0 0 48px;
          width: 48px;
          height: 38px;
          min-height: 38px;
          line-height: 0;
          border: 0;
          border-radius: 0;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          background: transparent;
          color: rgba(255, 255, 255, 0.96);
          box-shadow: none;
          backdrop-filter: none;
          cursor: pointer;
          padding: 0;
          pointer-events: auto;
          user-select: none;
          -webkit-user-select: none;
          -webkit-tap-highlight-color: transparent;
          transition: color 120ms ease, opacity 120ms ease;
        }

        .icon-button::before {
          content: "";
          position: absolute;
          top: 4px;
          right: 0;
          bottom: 4px;
          left: 0;
          border-radius: 20px;
          background: rgba(255, 255, 255, 0);
          transition: background-color 120ms ease, opacity 120ms ease;
          pointer-events: none;
        }

        .icon-button:hover::before {
          background: rgba(255, 255, 255, 0.11);
        }

        .icon-button[data-active="true"]::before {
          background: rgba(255, 255, 255, 0.14);
        }

        .icon-button[data-active="true"] {
          color: rgba(255, 255, 255, 1);
        }

        .icon-button svg {
          position: relative;
          z-index: 1;
          width: 24px;
          height: 24px;
          display: block;
          fill: none;
          stroke: currentColor;
          stroke-width: 1.8;
          stroke-linecap: round;
          stroke-linejoin: round;
        }

        .limit-label {
          position: relative;
          z-index: 1;
          font: 700 18px/1 "SF Pro Display", "Segoe UI", sans-serif;
          letter-spacing: 0.01em;
          transform: translateY(1px);
        }

        .limit-control {
          position: relative;
          flex: 0 0 48px;
          width: 48px;
          height: 38px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
        }

        .limit-inline-input {
          display: none;
          position: absolute;
          left: 50%;
          top: 50%;
          transform: translate(-50%, -50%);
          z-index: 2;
          box-sizing: border-box;
          width: 56px;
          height: 28px;
          border: 0;
          border-radius: 10px;
          padding: 0 6px;
          background: rgba(28, 28, 30, 0.96);
          box-shadow:
            0 10px 28px rgba(0, 0, 0, 0.28),
            inset 0 0 0 1px rgba(255, 255, 255, 0.12);
          color: rgba(255, 255, 255, 0.96);
          text-align: center;
          font: 700 13px/1 "SF Pro Text", "Segoe UI", sans-serif;
          outline: none;
        }

        .limit-inline-input:focus {
          box-shadow:
            0 10px 28px rgba(0, 0, 0, 0.28),
            inset 0 0 0 1px rgba(10, 132, 255, 0.92);
        }

        .limit-control[data-editing="true"] .icon-button {
          opacity: 0;
          pointer-events: none;
        }

        .limit-control[data-editing="true"] .limit-inline-input {
          display: block;
        }

        .badge {
          position: absolute;
          right: 8px;
          bottom: 8px;
          z-index: 1;
          min-width: 13px;
          height: 13px;
          padding: 0 3px;
          border-radius: 999px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          background: rgba(255, 255, 255, 0.95);
          color: rgba(0, 0, 0, 0.92);
          font: 700 8px/1 "SF Pro Text", "Segoe UI", sans-serif;
          box-shadow: none;
          pointer-events: none;
        }

      </style>
      <div class="toolbar">
        <button id="abButton" class="icon-button" type="button" aria-label="A-B loop controls">
          ${createIcon("ab")}
          <span id="abBadge" class="badge" hidden>AB</span>
        </button>
        <div id="limitControl" class="limit-control">
          <button id="limitButton" class="icon-button" type="button" aria-label="Set loop count">
            <span id="limitLabel" class="limit-label">∞</span>
          </button>
          <input id="limitInput" class="limit-inline-input" type="text" inputmode="numeric" aria-label="Loop count" />
        </div>
        <button id="loopToggle" class="icon-button" type="button" aria-label="Toggle loop">
          ${createIcon("loop")}
        </button>
      </div>
    `;

    shadowRoot.addEventListener("click", stopInsideInteraction);
    shadowRoot.addEventListener("mousedown", stopInsideInteraction);
    shadowRoot.addEventListener("dblclick", stopInsideInteraction);

    const elements = {
      toolbar: shadowRoot.querySelector(".toolbar"),
      loopToggle: shadowRoot.getElementById("loopToggle"),
      abButton: shadowRoot.getElementById("abButton"),
      abBadge: shadowRoot.getElementById("abBadge"),
      limitControl: shadowRoot.getElementById("limitControl"),
      limitButton: shadowRoot.getElementById("limitButton"),
      limitLabel: shadowRoot.getElementById("limitLabel"),
      limitInput: shadowRoot.getElementById("limitInput"),
    };

    bindButtonAction(elements.loopToggle, () => {
      void toggleLoopEnabled();
    });
    bindButtonAction(elements.abButton, () => {
      void toggleAbPopover();
    });
    bindLimitButtonAction(elements.limitButton);
    bindLoopCountInput(elements.limitInput);

    runtime.controlElements = elements;
  }

  function createAbPopoverMarkup(shadowRoot) {
    shadowRoot.innerHTML = `
      <style>
        :host {
          color-scheme: dark;
        }

        .popover {
          width: 220px;
          padding: 10px 14px;
          border-radius: 14px;
          background: rgba(28, 28, 30, 0.96);
          color: rgba(255, 255, 255, 0.95);
          box-shadow:
            0 18px 48px rgba(0, 0, 0, 0.34),
            inset 0 0 0 1px rgba(255, 255, 255, 0.08);
          backdrop-filter: blur(20px);
          pointer-events: auto;
        }

        .ab-row + .ab-row {
          margin-top: 6px;
        }

        .ab-grid {
          display: grid;
          grid-template-columns: 36px minmax(0, 1fr) 60px;
          align-items: center;
          gap: 8px;
        }

        .ab-label {
          display: inline-flex;
          align-items: center;
          color: rgba(255, 255, 255, 0.76);
          font: 700 11px/1 "SF Pro Text", "Segoe UI", sans-serif;
          text-transform: uppercase;
        }

        .time-input {
          box-sizing: border-box;
          width: 100%;
          min-width: 0;
          height: 34px;
          border: 0;
          border-radius: 9px;
          padding: 0 8px;
          background: rgba(255, 255, 255, 0.08);
          color: rgba(255, 255, 255, 0.96);
          text-align: center;
          font: 700 12px/1 "SF Pro Text", "Segoe UI", sans-serif;
          line-height: 34px;
          outline: none;
        }

        .time-input:focus {
          box-shadow: inset 0 0 0 1px rgba(10, 132, 255, 0.92);
          background: rgba(255, 255, 255, 0.12);
        }

        .time-slider {
          width: 100%;
          height: 16px;
          margin: 0;
          accent-color: rgba(255, 69, 58, 0.92);
          background: transparent;
          cursor: pointer;
        }

        .time-slider:disabled {
          cursor: not-allowed;
          opacity: 0.4;
        }

        .popover-footer {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          margin-top: 10px;
          padding-top: 8px;
          border-top: 1px solid rgba(255, 255, 255, 0.08);
          font: 12px/1.3 "SF Pro Text", "Segoe UI", sans-serif;
          color: rgba(255, 255, 255, 0.78);
        }

        .status-block {
          display: grid;
          gap: 2px;
        }

        .status-label {
          font-size: 10px;
          letter-spacing: 0.04em;
          text-transform: uppercase;
          color: rgba(255, 255, 255, 0.48);
        }

        .status-value {
          color: rgba(255, 255, 255, 0.95);
          font-weight: 700;
        }

        .mini-button {
          border: 0;
          border-radius: 10px;
          min-height: 28px;
          padding: 7px 9px;
          background: rgba(255, 255, 255, 0.08);
          color: rgba(255, 255, 255, 0.94);
          font: 600 11px/1 "SF Pro Text", "Segoe UI", sans-serif;
          cursor: pointer;
          pointer-events: auto;
        }

        .mini-button:hover {
          background: rgba(255, 255, 255, 0.14);
        }

        .mini-button--danger {
          background: rgba(255, 69, 58, 0.16);
          color: rgba(255, 133, 129, 1);
        }

        .mini-button--danger:hover {
          background: rgba(255, 69, 58, 0.22);
        }
      </style>
      <div class="popover">
        <div class="ab-row">
          <div class="ab-grid">
            <span class="ab-label">Start</span>
            <input id="startSlider" class="time-slider" type="range" min="0" max="0" step="1" value="0" aria-label="Start slider" />
            <input id="startInput" class="time-input" type="text" inputmode="numeric" placeholder="00:00" aria-label="Start time" />
          </div>
        </div>
        <div class="ab-row">
          <div class="ab-grid">
            <span class="ab-label">End</span>
            <input id="endSlider" class="time-slider" type="range" min="0" max="0" step="1" value="0" aria-label="End slider" />
            <input id="endInput" class="time-input" type="text" inputmode="numeric" placeholder="00:00" aria-label="End time" />
          </div>
        </div>
        <div class="popover-footer">
          <div class="status-block">
            <span class="status-label">Loops</span>
            <strong id="progressLabel" class="status-value">0 / ∞</strong>
          </div>
          <button id="clearAbButton" class="mini-button mini-button--danger" type="button">Clear A-B</button>
        </div>
      </div>
    `;

    shadowRoot.addEventListener("click", stopInsideInteraction);
    shadowRoot.addEventListener("mousedown", stopInsideInteraction);
    shadowRoot.addEventListener("dblclick", stopInsideInteraction);

    const elements = {
      startInput: shadowRoot.getElementById("startInput"),
      startSlider: shadowRoot.getElementById("startSlider"),
      endInput: shadowRoot.getElementById("endInput"),
      endSlider: shadowRoot.getElementById("endSlider"),
      progressLabel: shadowRoot.getElementById("progressLabel"),
      clearAbButton: shadowRoot.getElementById("clearAbButton"),
    };

    bindButtonAction(elements.clearAbButton, () => {
      void clearAbLoop();
    });
    bindTimeInput(elements.startInput, "start");
    bindTimeInput(elements.endInput, "end");
    bindTimeSlider(elements.startSlider, "start");
    bindTimeSlider(elements.endSlider, "end");

    runtime.abPopoverElements = elements;
  }

  function bindLimitButtonAction(element) {
    bindButtonAction(element, () => {
      openLimitEditor();
    });
  }

  function bindButtonAction(element, handler) {
    element.addEventListener("pointerdown", stopInteractionPropagation, true);
    element.addEventListener("mousedown", stopInteractionPropagation, true);
    element.addEventListener("pointerup", (event) => {
      if (event.button !== 0) {
        return;
      }

      consumeInteraction(event);
      handler();
    });
    element.addEventListener("click", consumeInteraction);
  }

  function bindTimeInput(element, kind) {
    element.addEventListener("pointerdown", stopInteractionPropagation, true);
    element.addEventListener("mousedown", stopInteractionPropagation, true);
    element.addEventListener("click", stopInteractionPropagation);
    element.addEventListener("focus", () => {
      setTimeout(() => {
        element.select();
      }, 0);
    });
    element.addEventListener("input", (event) => {
      stopInteractionPropagation(event);
      const sanitizedValue = shared.sanitizeTimeInputDraft(element.value);

      if (sanitizedValue !== element.value) {
        element.value = sanitizedValue;
        const nextCaret = element.value.length;
        element.setSelectionRange(nextCaret, nextCaret);
      }
    });
    element.addEventListener("keydown", (event) => {
      stopInteractionPropagation(event);
      if (event.key === "Enter") {
        event.preventDefault();
        void applyTimeInput(kind).then(() => {
          element.blur();
        });
      }
    });
    element.addEventListener("blur", () => {
      void applyTimeInput(kind);
    });
  }

  function bindLoopCountInput(element) {
    element.addEventListener("pointerdown", stopInteractionPropagation, true);
    element.addEventListener("mousedown", stopInteractionPropagation, true);
    element.addEventListener("click", stopInteractionPropagation);
    element.addEventListener("focus", () => {
      setTimeout(() => {
        element.select();
      }, 0);
    });
    element.addEventListener("input", (event) => {
      stopInteractionPropagation(event);
      const digitsOnly = element.value.replace(/\D/g, "").slice(0, 4);
      if (digitsOnly !== element.value) {
        element.value = digitsOnly;
      }
    });
    element.addEventListener("keydown", (event) => {
      stopInteractionPropagation(event);
      if (event.key === "Enter" || event.key === "Tab") {
        event.preventDefault();
        void applyLimitInput();
      }

      if (event.key === "Escape") {
        event.preventDefault();
        closePopovers();
      }
    });
    element.addEventListener("blur", () => {
      void applyLimitInput();
    });
  }

  function bindTimeSlider(element, kind) {
    element.addEventListener("pointerdown", stopInteractionPropagation, true);
    element.addEventListener("mousedown", stopInteractionPropagation, true);
    element.addEventListener("click", stopInteractionPropagation);
    element.addEventListener("input", (event) => {
      stopInteractionPropagation(event);
      previewSliderInput(kind);
    });
    element.addEventListener("change", (event) => {
      stopInteractionPropagation(event);
      void applySliderInput(kind);
    });
  }

  function previewSliderInput(kind) {
    const controls = getAbPopoverControlPair(kind);
    if (!controls) {
      return;
    }

    const sliderValue = Number(controls.slider.value);
    controls.input.value = shared.formatTime(sliderValue);
  }

  function consumeInteraction(event) {
    event.stopPropagation();
  }

  function stopInsideInteraction(event) {
    stopInteractionPropagation(event);
  }

  function stopInteractionPropagation(event) {
    event.stopPropagation();
  }

  function ensureControlHost() {
    if (runtime.controlHost && runtime.controlHost.isConnected && runtime.controlShadowRoot && runtime.controlElements) {
      return runtime.controlHost;
    }

    runtime.controlHost = createControlHost();
    runtime.controlShadowRoot = runtime.controlHost.attachShadow({ mode: "open" });
    createControlMarkup(runtime.controlShadowRoot);
    return runtime.controlHost;
  }

  function ensureAbPopoverHost() {
    if (
      runtime.abPopoverHost &&
      runtime.abPopoverHost.isConnected &&
      runtime.abPopoverShadowRoot &&
      runtime.abPopoverElements
    ) {
      return runtime.abPopoverHost;
    }

    const host = document.createElement("div");
    host.setAttribute("data-youtube-smart-looper-popover", "true");
    host.style.position = "fixed";
    host.style.left = "0";
    host.style.top = "0";
    host.style.zIndex = "2147483647";
    host.style.pointerEvents = "auto";

    runtime.abPopoverHost = host;
    runtime.abPopoverShadowRoot = host.attachShadow({ mode: "open" });
    createAbPopoverMarkup(runtime.abPopoverShadowRoot);

    host.addEventListener("mouseleave", () => {
      if (runtime.openPopover === "ab" && runtime.shouldCloseAbPopoverOnLeave) {
        closePopovers();
      }
    });

    document.body.appendChild(host);
    return host;
  }

  function removeAbPopoverHost() {
    if (runtime.abPopoverHost && runtime.abPopoverHost.isConnected) {
      runtime.abPopoverHost.remove();
    }

    runtime.abPopoverHost = null;
    runtime.abPopoverShadowRoot = null;
    runtime.abPopoverElements = null;
  }

  function syncAbPopoverPosition() {
    if (
      runtime.openPopover !== "ab" ||
      !runtime.abPopoverHost
    ) {
      return;
    }

    const player = runtime.currentVideo
      ? runtime.currentVideo.closest(".html5-video-player")
      : null;
    const playerRect = player instanceof HTMLElement
      ? player.getBoundingClientRect()
      : null;
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
    const rightOffset = playerRect
      ? Math.max(16, Math.round(viewportWidth - playerRect.right + 20))
      : 24;
    const bottomOffset = playerRect
      ? Math.max(16, Math.round(viewportHeight - playerRect.bottom + 84))
      : 88;

    runtime.abPopoverHost.style.left = "auto";
    runtime.abPopoverHost.style.top = "auto";
    runtime.abPopoverHost.style.right = String(rightOffset) + "px";
    runtime.abPopoverHost.style.bottom = String(bottomOffset) + "px";
  }


  function openLimitEditor() {
    if (!runtime.controlElements) {
      return;
    }

    runtime.openPopover = "limit";
    runtime.shouldCloseAbPopoverOnLeave = false;
    removeAbPopoverHost();
    runtime.controlElements.limitControl.setAttribute("data-editing", "true");
    runtime.controlElements.limitInput.value =
      getDisplayedLoopCount(runtime.persistedState) === null
        ? ""
        : String(getDisplayedLoopCount(runtime.persistedState));
    updateControls();

    setTimeout(() => {
      if (!runtime.controlElements || runtime.openPopover !== "limit") {
        return;
      }

      runtime.controlElements.limitInput.focus();
    }, 0);
  }

  function closeLimitEditor() {
    if (!runtime.controlElements) {
      return;
    }

    runtime.controlElements.limitControl.setAttribute("data-editing", "false");
  }

  function removeControls() {
    if (runtime.controlHost && runtime.controlHost.isConnected) {
      runtime.controlHost.remove();
    }

    removeAbPopoverHost();

    runtime.controlHost = null;
    runtime.controlShadowRoot = null;
    runtime.controlElements = null;
    runtime.controlPlacement = "hidden";
    runtime.controlAnchor = null;
    runtime.controlContainer = null;
    runtime.openPopover = "";
    setDebugStatus("mount:removed");
  }

  function mountControlsInPlayer(video) {
    const mountTarget = chooseControlBarMountTarget(video);

    if (!mountTarget || !(mountTarget.container instanceof HTMLElement)) {
      return "pending";
    }

    const host = ensureControlHost();
    const canReuseMount = panelRuntime.canReusePanelMount(
      {
        hostConnected: Boolean(host && host.isConnected),
        placement: runtime.controlPlacement,
        anchor: runtime.controlAnchor,
        container: runtime.controlContainer,
      },
      {
        placement: "control-bar",
        anchor: mountTarget.anchor,
        container: mountTarget.container,
      }
    );

    if (canReuseMount) {
      runtime.controlPlacement = "control-bar";
      if (panelRuntime.isMountedAsExpected(host, mountTarget.container, mountTarget.anchor)) {
        return true;
      }
    }

    host.style.display = "inline-flex";
    host.style.position = "relative";
    host.style.top = "-2px";
    host.style.width = "auto";
    host.style.maxWidth = "none";
    host.style.margin = "0";
    host.style.verticalAlign = "middle";
    host.style.flex = "0 0 auto";
    host.style.zIndex = "1";
    host.style.pointerEvents = "auto";

    try {
      if (
        mountTarget.anchor instanceof HTMLElement &&
        panelRuntime.canInsertBefore(mountTarget.container, mountTarget.anchor)
      ) {
        mountTarget.container.insertBefore(host, mountTarget.anchor);
      } else {
        mountTarget.container.appendChild(host);
      }
    } catch (error) {
      console.warn("[YouTube Smart Looper] Failed to mount controls in player.", error);
      setDebugStatus("mount:error");
      return false;
    }

    const rect = host.getBoundingClientRect();
    if (!panelRuntime.hasRenderableMountRect(rect)) {
      host.remove();
      setDebugStatus("mount:invisible");
      return false;
    }

    runtime.controlPlacement = "control-bar";
    runtime.controlAnchor = mountTarget.anchor || null;
    runtime.controlContainer = mountTarget.container;
    setDebugStatus("mount:control-bar");
    return true;
  }

  function mountFallbackControls() {
    const host = ensureControlHost();

    if (
      runtime.controlPlacement === "fallback" &&
      host.isConnected &&
      host.parentNode === document.body
    ) {
      return;
    }

    document.body.appendChild(host);
    host.style.display = "block";
    host.style.position = "fixed";
    host.style.right = "16px";
    host.style.bottom = "16px";
    host.style.margin = "0";
    host.style.zIndex = "2147483647";
    host.style.width = "auto";
    host.style.maxWidth = "none";
    runtime.controlPlacement = "fallback";
    runtime.controlAnchor = null;
    runtime.controlContainer = document.body;
    setDebugStatus("mount:fallback");
  }

  function ensureControlsMounted() {
    if (!runtime.currentVideoId || !runtime.currentVideo) {
      setDebugStatus("mount:skip", !runtime.currentVideoId ? "no-video-id" : "no-video");
      removeControls();
      return;
    }

    const mountResult = mountControlsInPlayer(runtime.currentVideo);
    if (mountResult === true) {
      updateControls();
      return;
    }

    if (mountResult === "pending") {
      setDebugStatus("mount:pending");
      updateControls();
      return;
    }

    if (!mountResult) {
      mountFallbackControls();
    }

    updateControls();
  }

  function syncAbPopoverTimeControl(kind) {
    const controls = getAbPopoverControlPair(kind);
    if (!controls || !runtime.abPopoverShadowRoot) {
      return;
    }

    const sliderLimit = getSliderDurationLimit();
    const fallbackValue = kind === "start" ? 0 : sliderLimit || 0;
    const stateValue = getAbStateValue(kind);
    const sliderValue = Number.isFinite(stateValue)
      ? Math.min(Math.max(Math.round(stateValue), 0), sliderLimit || 0)
      : fallbackValue;

    if (runtime.abPopoverShadowRoot.activeElement !== controls.input) {
      controls.input.value = Number.isFinite(stateValue) ? shared.formatTime(stateValue) : "";
    }

    controls.slider.min = "0";
    controls.slider.max = String(Math.max(sliderLimit || 0, 0));
    controls.slider.value = String(sliderValue);
    controls.slider.disabled = !Number.isFinite(sliderLimit) || sliderLimit <= 0;
  }

  function updateControls() {
    if (!runtime.controlElements) {
      return;
    }

    const state = runtime.persistedState;
    const activeMode = loopEngine.getActiveLoopMode(state);
    const hasValidAbLoop = loopEngine.hasValidAbLoop(state);
    const loopLimit = loopEngine.getNormalizedLoopLimit(state);
    const displayedLoopCount = getDisplayedLoopCount(state);
    const isInfiniteMode = activeMode === "full" && loopLimit === null;
    const isLimitedLoopMode = state.fullLoopEnabled && loopLimit !== null;
    const isAbMode = activeMode === "ab";

    runtime.controlElements.loopToggle.setAttribute("data-active", isInfiniteMode ? "true" : "false");
    runtime.controlElements.loopToggle.setAttribute(
      "title",
      isInfiniteMode ? "Infinite Loop On" : "Infinite Loop Off"
    );
    runtime.controlElements.loopToggle.disabled = runtime.isTogglePending;

    runtime.controlElements.abButton.setAttribute("data-active", isAbMode ? "true" : "false");
    runtime.controlElements.abButton.setAttribute("title", "A-B loop");
    runtime.controlElements.abBadge.hidden = !hasValidAbLoop;
    runtime.controlElements.limitButton.setAttribute("data-active", isLimitedLoopMode ? "true" : "false");
    runtime.controlElements.limitButton.setAttribute(
      "title",
      "Loop count: " + (displayedLoopCount === null ? "unset" : String(displayedLoopCount))
    );
    runtime.controlElements.limitLabel.textContent = displayedLoopCount === null ? "∞" : String(displayedLoopCount);
    runtime.controlElements.limitControl.setAttribute("data-editing", runtime.openPopover === "limit" ? "true" : "false");

    if (runtime.abPopoverElements && runtime.abPopoverShadowRoot) {
      syncAbPopoverTimeControl("start");
      syncAbPopoverTimeControl("end");
      runtime.abPopoverElements.progressLabel.textContent =
        displayedLoopCount === null ? "∞" : String(displayedLoopCount);
    }

    if (runtime.openPopover !== "limit" || runtime.controlShadowRoot.activeElement !== runtime.controlElements.limitInput) {
      runtime.controlElements.limitInput.value = displayedLoopCount === null ? "" : String(displayedLoopCount);
    }

    if (runtime.openPopover === "ab") {
      syncAbPopoverPosition();
    }
  }

  function closePopovers() {
    if (!runtime.openPopover) {
      return;
    }

    if (runtime.openPopover === "limit") {
      closeLimitEditor();
    }

    runtime.openPopover = "";
    runtime.shouldCloseAbPopoverOnLeave = false;
    removeAbPopoverHost();
    updateControls();
  }

  async function toggleAbPopover() {
    runtime.shouldCloseAbPopoverOnLeave = false;
    runtime.openPopover = runtime.openPopover === "ab" ? "" : "ab";
    closeLimitEditor();

    const activeMode = loopEngine.getActiveLoopMode(runtime.persistedState);
    const loopLimit = loopEngine.getNormalizedLoopLimit(runtime.persistedState);

    if (runtime.openPopover === "ab" && activeMode === "full" && loopLimit === null) {
      runtime.persistedState = loopEngine.toggleInfiniteLoop(runtime.persistedState);
      applyLoopSettingsToCurrentVideo();
      await persistCurrentState();
    }

    if (runtime.openPopover === "ab") {
      ensureAbPopoverHost();
      syncAbPopoverPosition();
    } else {
      removeAbPopoverHost();
    }
    updateControls();
  }

  function resetProgressAndNormalize() {
    runtime.persistedState = loopEngine.resetLoopProgress(runtime.persistedState);
    normalizeRuntimeState();
    applyLoopSettingsToCurrentVideo();
  }

  async function toggleLoopEnabled() {
    if (runtime.isTogglePending) {
      return;
    }

    if (runtime.openPopover === "ab") {
      closePopovers();
    }

    runtime.isTogglePending = true;

    if (loopEngine.hasValidAbLoop(runtime.persistedState)) {
      runtime.persistedState = loopEngine.clearAbLoop(runtime.persistedState);
      runtime.persistedState = loopEngine.enableInfiniteLoop(runtime.persistedState);
      closePopovers();
    } else {
      runtime.persistedState = loopEngine.toggleInfiniteLoop(runtime.persistedState);
    }
    setDebugStatus("toggle:loop", "mode=" + loopEngine.getActiveLoopMode(runtime.persistedState));
    applyLoopSettingsToCurrentVideo();
    updateControls();

    try {
      await persistCurrentState();
    } finally {
      runtime.isTogglePending = false;
      updateControls();
    }
  }

  async function commitAbPoint(kind, seconds) {
    if (!runtime.currentVideo || !runtime.abPopoverElements) {
      return;
    }

    runtime.shouldCloseAbPopoverOnLeave = false;
    const hadValidAbLoop = loopEngine.hasValidAbLoop(runtime.persistedState);

    const normalizedTime = clampAbTimeToDuration(seconds);

    if (!Number.isFinite(normalizedTime)) {
      setDebugStatus("ab:invalid", kind);
      updateControls();
      return;
    }

    if (kind === "start") {
      runtime.persistedState.startTime = normalizedTime;
    } else {
      runtime.persistedState.endTime = normalizedTime;
    }

    normalizeRuntimeState();
    runtime.persistedState = loopEngine.applyAbLoopInput(runtime.persistedState);
    resetProgressAndNormalize();

    if (!hadValidAbLoop && loopEngine.hasValidAbLoop(runtime.persistedState)) {
      runtime.currentVideo.currentTime = runtime.persistedState.startTime;
    }

    setDebugStatus(
      "ab:set",
      kind + "=" + shared.formatTime(normalizedTime) + " mode=" + loopEngine.getActiveLoopMode(runtime.persistedState)
    );
    updateControls();
    await persistCurrentState();
  }

  async function setAbPoint(kind) {
    const controls = getAbPopoverControlPair(kind);
    if (!controls) {
      return;
    }

    const parsedTime = shared.parseTimeInput(controls.input.value);
    if (!Number.isFinite(parsedTime)) {
      setDebugStatus("ab:invalid", kind);
      updateControls();
      return;
    }

    await commitAbPoint(kind, parsedTime);
  }

  async function applyTimeInput(kind) {
    await setAbPoint(kind);
  }

  async function applySliderInput(kind) {
    const controls = getAbPopoverControlPair(kind);
    if (!controls) {
      return;
    }

    await commitAbPoint(kind, Number(controls.slider.value));
  }

  async function applyLimitInput() {
    if (!runtime.controlElements || runtime.openPopover !== "limit") {
      return;
    }

    const rawValue = runtime.controlElements.limitInput.value.trim();

    if (!rawValue) {
      closePopovers();
      return;
    }

    const nextLimit = Number(rawValue);
    if (!Number.isInteger(nextLimit) || nextLimit < 0) {
      closePopovers();
      return;
    }

    if (nextLimit === 0) {
      runtime.persistedState.fullLoopEnabled = false;
      runtime.persistedState.loopLimit = null;
      runtime.persistedState.completedLoops = 0;
    } else {
      runtime.persistedState = loopEngine.applyLoopLimitSelection(runtime.persistedState, nextLimit);
      setDebugStatus("limit:set", String(nextLimit));
    }

    applyLoopSettingsToCurrentVideo();
    closePopovers();
    await persistCurrentState();
  }

  async function clearAbLoop() {
    runtime.persistedState = loopEngine.clearAbLoop(runtime.persistedState);
    runtime.shouldCloseAbPopoverOnLeave = true;
    resetProgressAndNormalize();
    setDebugStatus("ab:clear");
    updateControls();
    await persistCurrentState();
  }

  async function syncVideoBinding() {
    if (!runtime.currentVideoId) {
      setDebugStatus("page:skip", "not-watch");
      clearCurrentVideo();
      removeControls();
      return;
    }

    const latestVideo = getCurrentVideoElement();

    if (!latestVideo) {
      setDebugStatus("video:missing");
      clearCurrentVideo();
      removeControls();
      return;
    }

    if (latestVideo !== runtime.currentVideo) {
      attachVideoListeners(latestVideo);
    }

    ensureControlsMounted();
  }

  function shouldRefreshVideoBinding() {
    if (!runtime.currentVideoId) {
      return runtime.controlPlacement !== "hidden";
    }

    const latestVideo = getCurrentVideoElement();
    if (!latestVideo) {
      return true;
    }

    if (latestVideo !== runtime.currentVideo) {
      return true;
    }

    if (runtime.controlPlacement === "hidden") {
      return true;
    }

    if (runtime.controlPlacement === "control-bar") {
      if (!runtime.controlHost || !runtime.controlHost.isConnected) {
        return true;
      }

      const nextMountTarget = chooseControlBarMountTarget(latestVideo);
      if (!nextMountTarget || !(nextMountTarget.container instanceof HTMLElement)) {
        return true;
      }

      if (
        nextMountTarget.container !== runtime.controlContainer ||
        nextMountTarget.anchor !== runtime.controlAnchor
      ) {
        return true;
      }

      return !panelRuntime.isMountedAsExpected(
        runtime.controlHost,
        nextMountTarget.container,
        nextMountTarget.anchor
      );
    }

    return false;
  }

  async function refreshForCurrentPage() {
    if (runtime.isDestroyed) {
      return;
    }

    const token = ++runtime.refreshToken;
    const nextUrl = location.href;
    const nextVideoId = shared.parseVideoIdFromUrl(nextUrl);
    const videoIdChanged = nextVideoId !== runtime.currentVideoId;

    runtime.currentUrl = nextUrl;
    if (videoIdChanged) {
      setDebugStatus("page:refresh", nextVideoId || "no-video-id");
    }

    if (videoIdChanged) {
      clearCurrentVideo();
      removeControls();
      runtime.currentVideoId = nextVideoId;
      runtime.persistedState = shared.createDefaultState();
      setDebugStatus("page:video-change", nextVideoId || "no-video-id");

      if (runtime.currentVideoId) {
        const storedState = await readPersistedState(runtime.currentVideoId);

        if (token !== runtime.refreshToken || runtime.isDestroyed) {
          return;
        }

        runtime.persistedState = shared.normalizePersistedState(storedState, {
          duration: getCurrentDuration(),
        });
        runtime.persistedState = applyInitialLoopOffState(runtime.persistedState);
      }
    }

    if (token !== runtime.refreshToken || runtime.isDestroyed) {
      return;
    }

    await syncVideoBinding();
  }

  function scheduleMutationRefresh() {
    if (runtime.mutationDebounceTimer) {
      clearTimeout(runtime.mutationDebounceTimer);
    }

    runtime.mutationDebounceTimer = setTimeout(() => {
      runtime.mutationDebounceTimer = null;
      if (location.href !== runtime.currentUrl) {
        void refreshForCurrentPage();
        return;
      }

      if (shouldRefreshVideoBinding()) {
        void syncVideoBinding();
      }
    }, MUTATION_DEBOUNCE_MS);
  }

  function handleDocumentPointer(event) {
    if (!runtime.controlHost && !runtime.abPopoverHost) {
      return;
    }

    const path = typeof event.composedPath === "function" ? event.composedPath() : [];
    if (path.includes(runtime.controlHost) || path.includes(runtime.abPopoverHost)) {
      return;
    }

    if (runtime.openPopover === "limit") {
      void applyLimitInput();
      return;
    }

    closePopovers();
  }

  function handleDocumentKeydown(event) {
    if (event.key === "Escape" && runtime.openPopover) {
      closePopovers();
    }
  }

  function handleViewportChange() {
    if (runtime.openPopover === "ab") {
      syncAbPopoverPosition();
    }
  }

  function startNavigationWatchers() {
    if (runtime.navigationWatchersAttached) {
      return;
    }

    runtime.navigationWatchersAttached = true;
    window.addEventListener("yt-navigate-finish", handleYouTubeNavigation, true);
    document.addEventListener("click", handleDocumentPointer, true);
    document.addEventListener("keydown", handleDocumentKeydown, true);
    window.addEventListener("resize", handleViewportChange, true);
    window.addEventListener("scroll", handleViewportChange, true);

    runtime.hrefPollTimer = setInterval(() => {
      if (location.href !== runtime.currentUrl) {
        void refreshForCurrentPage();
      }
    }, HREF_POLL_INTERVAL_MS);

    runtime.videoMonitorTimer = setInterval(() => {
      if (shouldRefreshVideoBinding()) {
        void syncVideoBinding();
      }
    }, VIDEO_MONITOR_INTERVAL_MS);

    runtime.mutationObserver = new MutationObserver(() => {
      scheduleMutationRefresh();
    });

    runtime.mutationObserver.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
  }

  function stopNavigationWatchers() {
    if (!runtime.navigationWatchersAttached) {
      return;
    }

    runtime.navigationWatchersAttached = false;
    window.removeEventListener("yt-navigate-finish", handleYouTubeNavigation, true);
    document.removeEventListener("click", handleDocumentPointer, true);
    document.removeEventListener("keydown", handleDocumentKeydown, true);
    window.removeEventListener("resize", handleViewportChange, true);
    window.removeEventListener("scroll", handleViewportChange, true);

    if (runtime.hrefPollTimer) {
      clearInterval(runtime.hrefPollTimer);
      runtime.hrefPollTimer = null;
    }

    if (runtime.videoMonitorTimer) {
      clearInterval(runtime.videoMonitorTimer);
      runtime.videoMonitorTimer = null;
    }

    if (runtime.mutationDebounceTimer) {
      clearTimeout(runtime.mutationDebounceTimer);
      runtime.mutationDebounceTimer = null;
    }

    if (runtime.mutationObserver) {
      runtime.mutationObserver.disconnect();
      runtime.mutationObserver = null;
    }
  }

  function handleYouTubeNavigation() {
    void refreshForCurrentPage();
  }

  function handleMessage(message, sender, sendResponse) {
    if (!message || message.type !== shared.MESSAGE_TYPES.GET_LOOP_STATE) {
      sendResponse({ ok: false, error: "Unsupported message type." });
      return false;
    }

    sendResponse({ ok: true, state: buildStateSnapshot() });
    return false;
  }

  async function init() {
    setDebugStatus("boot", runtime.currentVideoId || "no-video-id");
    if (runtime.currentVideoId) {
      const storedState = await readPersistedState(runtime.currentVideoId);
      runtime.persistedState = shared.normalizePersistedState(storedState, {
        duration: getCurrentDuration(),
      });
      runtime.persistedState = applyInitialLoopOffState(runtime.persistedState);
      setDebugStatus("state:loaded", loopEngine.getActiveLoopMode(runtime.persistedState));
    }

    await syncVideoBinding();
    startNavigationWatchers();
    setDebugStatus("ready", runtime.controlPlacement);
  }

  function destroy() {
    runtime.isDestroyed = true;
    setDebugStatus("destroy");
    stopNavigationWatchers();
    clearCurrentVideo();
    removeControls();
    chrome.runtime.onMessage.removeListener(handleMessage);
  }

  chrome.runtime.onMessage.addListener(handleMessage);
  globalThis.__youtubeSmartLooperContentRuntime = { destroy: destroy };
  void init();
})();
