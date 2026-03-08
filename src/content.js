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
  const DEBUG_MARKER_ID = "youtube-smart-looper-debug";
  const LOOP_LIMIT_OPTIONS = [null, 1, 3, 5, 10];

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
    debugMarker: null,
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

  function ensureDebugMarker() {
    if (runtime.debugMarker && runtime.debugMarker.isConnected) {
      return runtime.debugMarker;
    }

    const marker = document.createElement("div");
    marker.id = DEBUG_MARKER_ID;
    marker.setAttribute("data-youtube-smart-looper-debug", "true");
    marker.style.position = "fixed";
    marker.style.left = "12px";
    marker.style.bottom = "12px";
    marker.style.zIndex = "2147483647";
    marker.style.padding = "6px 8px";
    marker.style.borderRadius = "999px";
    marker.style.background = "rgba(255, 69, 58, 0.92)";
    marker.style.color = "#fff";
    marker.style.font = '600 11px/1.2 "SF Pro Text", "Segoe UI", sans-serif';
    marker.style.boxShadow = "0 8px 24px rgba(0, 0, 0, 0.28)";
    marker.style.border = "1px solid rgba(255, 255, 255, 0.24)";
    marker.style.pointerEvents = "none";
    marker.style.maxWidth = "220px";
    marker.style.whiteSpace = "nowrap";
    marker.style.overflow = "hidden";
    marker.style.textOverflow = "ellipsis";
    runtime.debugMarker = marker;

    const target = document.body || document.documentElement;
    if (target) {
      target.appendChild(marker);
    }

    return marker;
  }

  function setDebugStatus(status, details) {
    const nextText = details ? "YSL " + status + " " + details : "YSL " + status;
    if (runtime.debugStatusText === nextText) {
      return;
    }

    runtime.debugStatus = status;
    runtime.debugStatusText = nextText;

    const marker = ensureDebugMarker();
    if (marker) {
      marker.textContent = nextText;
    }

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
    runtime.currentVideo.currentTime = targetTime;

    const activeMode = loopEngine.getActiveLoopMode(runtime.persistedState);
    const previousEnabled = runtime.persistedState.fullLoopEnabled;
    runtime.persistedState = loopEngine.recordLoopIteration(runtime.persistedState);
    applyLoopSettingsToCurrentVideo();
    updateControls();

    if (runtime.persistedState.fullLoopEnabled !== previousEnabled || activeMode === "ab") {
      void persistCurrentState();
    }

    setTimeout(() => {
      runtime.isProgrammaticWrapInProgress = false;
    }, 60);
  }

  function handleVideoEnded() {
    if (!runtime.currentVideo || !runtime.persistedState.fullLoopEnabled) {
      return;
    }

    const activeMode = loopEngine.getActiveLoopMode(runtime.persistedState);
    const loopLimit = loopEngine.getNormalizedLoopLimit(runtime.persistedState);

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
      runtime.currentVideo.currentTime = targetTime;
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

      const parentContainer = match.parentElement;
      if (parentContainer instanceof HTMLElement && rightControls.contains(parentContainer)) {
        anchor = match;
        container = parentContainer;
        break;
      }
    }

    if (!(anchor instanceof HTMLElement)) {
      anchor = rightControls.firstElementChild instanceof HTMLElement ? rightControls.firstElementChild : null;
      container = rightControls;
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
        }

        .toolbar {
          position: relative;
          display: inline-flex;
          align-items: center;
          gap: 0;
          padding: 0;
          pointer-events: auto;
        }

        .icon-button {
          position: relative;
          width: 36px;
          height: 36px;
          line-height: 0;
          border: 0;
          border-radius: 18px;
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
          transition: background-color 120ms ease, color 120ms ease, opacity 120ms ease;
        }

        .icon-button:hover {
          background: rgba(255, 255, 255, 0.12);
        }

        .icon-button[data-active="true"] {
          background: rgba(255, 255, 255, 0.18);
          color: rgba(255, 255, 255, 1);
        }

        .icon-button svg {
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
          font: 700 16px/1 "SF Pro Display", "Segoe UI", sans-serif;
          letter-spacing: 0.01em;
        }

        .badge {
          position: absolute;
          right: 2px;
          bottom: 2px;
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
        <button id="limitButton" class="icon-button" type="button" aria-label="Cycle loop limit">
          <span id="limitLabel" class="limit-label">∞</span>
        </button>
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
      limitButton: shadowRoot.getElementById("limitButton"),
      limitLabel: shadowRoot.getElementById("limitLabel"),
    };

    bindButtonAction(elements.loopToggle, () => {
      void toggleLoopEnabled();
    });
    bindButtonAction(elements.abButton, () => {
      toggleAbPopover();
    });
    bindButtonAction(elements.limitButton, () => {
      void cycleLoopLimit();
    });

    runtime.controlElements = elements;
  }

  function createAbPopoverMarkup(shadowRoot) {
    shadowRoot.innerHTML = `
      <style>
        :host {
          color-scheme: dark;
        }

        .popover {
          width: 248px;
          padding: 12px;
          border-radius: 16px;
          background: rgba(28, 28, 30, 0.96);
          color: rgba(255, 255, 255, 0.95);
          box-shadow:
            0 18px 48px rgba(0, 0, 0, 0.34),
            inset 0 0 0 1px rgba(255, 255, 255, 0.08);
          backdrop-filter: blur(20px);
          pointer-events: auto;
        }

        .popover-title {
          font: 700 13px/1.2 "SF Pro Display", "Segoe UI", sans-serif;
          margin-bottom: 10px;
        }

        .popover-line {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          font: 12px/1.35 "SF Pro Text", "Segoe UI", sans-serif;
          color: rgba(255, 255, 255, 0.8);
        }

        .popover-line + .popover-line {
          margin-top: 8px;
        }

        .time-field {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .time-input {
          width: 92px;
          border: 0;
          border-radius: 10px;
          padding: 7px 9px;
          background: rgba(255, 255, 255, 0.08);
          color: rgba(255, 255, 255, 0.96);
          text-align: right;
          font: 600 12px/1 "SF Pro Text", "Segoe UI", sans-serif;
          outline: none;
        }

        .time-input:focus {
          box-shadow: inset 0 0 0 1px rgba(10, 132, 255, 0.92);
          background: rgba(255, 255, 255, 0.12);
        }

        .controls-row {
          display: grid;
          grid-template-columns: 1fr;
          gap: 8px;
          margin-top: 12px;
        }

        .mini-button {
          border: 0;
          border-radius: 12px;
          min-height: 32px;
          padding: 8px 10px;
          background: rgba(255, 255, 255, 0.08);
          color: rgba(255, 255, 255, 0.94);
          font: 600 12px/1 "SF Pro Text", "Segoe UI", sans-serif;
          cursor: pointer;
          pointer-events: auto;
        }

        .mini-button--ghost {
          min-height: 28px;
          padding: 6px 8px;
          border-radius: 10px;
          background: rgba(255, 255, 255, 0.06);
          font-size: 11px;
        }

        .mini-button:hover {
          background: rgba(255, 255, 255, 0.14);
        }

        .mini-button--danger {
          grid-column: 1 / -1;
          background: rgba(255, 69, 58, 0.14);
          color: rgba(255, 133, 129, 1);
        }

        .mini-button--danger:hover {
          background: rgba(255, 69, 58, 0.22);
        }
      </style>
      <div class="popover">
        <div class="popover-title">A-B Loop</div>
        <div class="popover-line">
          <span>A Start</span>
          <div class="time-field">
            <input id="startInput" class="time-input" type="text" inputmode="numeric" placeholder="00:00" />
            <button id="startNowButton" class="mini-button mini-button--ghost" type="button">Now</button>
          </div>
        </div>
        <div class="popover-line">
          <span>B End</span>
          <div class="time-field">
            <input id="endInput" class="time-input" type="text" inputmode="numeric" placeholder="00:00" />
            <button id="endNowButton" class="mini-button mini-button--ghost" type="button">Now</button>
          </div>
        </div>
        <div class="popover-line">
          <span>Duration</span>
          <strong id="durationLabel">--:--</strong>
        </div>
        <div class="popover-line">
          <span>Mode</span>
          <strong id="modeLabel">Off</strong>
        </div>
        <div class="popover-line">
          <span>Loops</span>
          <strong id="progressLabel">0 / ∞</strong>
        </div>
        <div class="controls-row">
          <button id="clearAbButton" class="mini-button mini-button--danger" type="button">Clear A-B</button>
        </div>
      </div>
    `;

    shadowRoot.addEventListener("click", stopInsideInteraction);
    shadowRoot.addEventListener("mousedown", stopInsideInteraction);
    shadowRoot.addEventListener("dblclick", stopInsideInteraction);

    const elements = {
      startInput: shadowRoot.getElementById("startInput"),
      startNowButton: shadowRoot.getElementById("startNowButton"),
      endInput: shadowRoot.getElementById("endInput"),
      endNowButton: shadowRoot.getElementById("endNowButton"),
      durationLabel: shadowRoot.getElementById("durationLabel"),
      modeLabel: shadowRoot.getElementById("modeLabel"),
      progressLabel: shadowRoot.getElementById("progressLabel"),
      clearAbButton: shadowRoot.getElementById("clearAbButton"),
    };

    bindButtonAction(elements.clearAbButton, () => {
      void clearAbLoop();
    });
    bindTimeInput(elements.startInput, "start");
    bindTimeInput(elements.endInput, "end");
    bindButtonAction(elements.startNowButton, () => {
      void setAbPointFromCurrent("start");
    });
    bindButtonAction(elements.endNowButton, () => {
      void setAbPointFromCurrent("end");
    });

    runtime.abPopoverElements = elements;
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
      const formattedValue = shared.formatTimeInputDraft(element.value);
      if (!formattedValue && !element.value.replace(/\D/g, "")) {
        element.value = "";
        return;
      }

      if (formattedValue) {
        element.value = formattedValue;
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
      return false;
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

    if (!mountControlsInPlayer(runtime.currentVideo)) {
      mountFallbackControls();
    }

    updateControls();
  }

  function updateControls() {
    if (!runtime.controlElements) {
      return;
    }

    const state = runtime.persistedState;
    const activeMode = loopEngine.getActiveLoopMode(state);
    const hasValidAbLoop = loopEngine.hasValidAbLoop(state);
    const loopLimit = loopEngine.getNormalizedLoopLimit(state);
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
      "Loop limit: " + (loopLimit === null ? "infinite" : String(loopLimit))
    );
    runtime.controlElements.limitLabel.textContent = loopLimit === null ? "∞" : String(loopLimit);

    if (runtime.abPopoverElements && runtime.abPopoverShadowRoot) {
      const abDuration = loopEngine.hasValidAbLoop(state)
        ? Math.max(0, state.endTime - state.startTime)
        : null;

      if (runtime.abPopoverShadowRoot.activeElement !== runtime.abPopoverElements.startInput) {
        runtime.abPopoverElements.startInput.value = shared.formatTime(state.startTime);
      }

      if (runtime.abPopoverShadowRoot.activeElement !== runtime.abPopoverElements.endInput) {
        runtime.abPopoverElements.endInput.value = shared.formatTime(state.endTime);
      }

      runtime.abPopoverElements.durationLabel.textContent = shared.formatTime(abDuration);
      runtime.abPopoverElements.modeLabel.textContent =
        activeMode === "ab" ? "A-B" : activeMode === "full" ? "Infinite" : "Off";
      runtime.abPopoverElements.progressLabel.textContent =
        String(state.completedLoops || 0) + " / " + (loopLimit === null ? "∞" : String(loopLimit));
    }

    if (runtime.openPopover === "ab") {
      syncAbPopoverPosition();
    }
  }

  function closePopovers() {
    if (!runtime.openPopover) {
      return;
    }

    runtime.openPopover = "";
    runtime.shouldCloseAbPopoverOnLeave = false;
    removeAbPopoverHost();
    updateControls();
  }

  function toggleAbPopover() {
    runtime.shouldCloseAbPopoverOnLeave = false;
    runtime.openPopover = runtime.openPopover === "ab" ? "" : "ab";
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

    runtime.isTogglePending = true;
    runtime.persistedState = loopEngine.toggleInfiniteLoop(runtime.persistedState);
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

  async function setAbPoint(kind) {
    if (!runtime.currentVideo || !runtime.abPopoverElements) {
      return;
    }

    runtime.shouldCloseAbPopoverOnLeave = false;

    const inputElement = kind === "start" ? runtime.abPopoverElements.startInput : runtime.abPopoverElements.endInput;
    const parsedTime = shared.parseTimeInput(inputElement.value);
    const duration = getCurrentDuration();

    if (!Number.isFinite(parsedTime)) {
      setDebugStatus("ab:invalid", kind);
      updateControls();
      return;
    }

    const normalizedTime = duration && Number.isFinite(duration)
      ? Math.min(Math.max(parsedTime, 0), duration)
      : Math.max(parsedTime, 0);

    if (kind === "start") {
      runtime.persistedState.startTime = normalizedTime;
    } else {
      runtime.persistedState.endTime = normalizedTime;
    }

    normalizeRuntimeState();
    runtime.persistedState = loopEngine.applyAbLoopInput(runtime.persistedState);
    resetProgressAndNormalize();

    if (loopEngine.hasValidAbLoop(runtime.persistedState)) {
      runtime.currentVideo.currentTime = runtime.persistedState.startTime;
    }

    setDebugStatus(
      "ab:set",
      kind + "=" + shared.formatTime(normalizedTime) + " mode=" + loopEngine.getActiveLoopMode(runtime.persistedState)
    );
    updateControls();
    await persistCurrentState();
  }

  async function setAbPointFromCurrent(kind) {
    if (!runtime.currentVideo || !runtime.abPopoverElements) {
      return;
    }

    runtime.shouldCloseAbPopoverOnLeave = false;
    const currentTime = Math.max(runtime.currentVideo.currentTime || 0, 0);
    const inputElement = kind === "start" ? runtime.abPopoverElements.startInput : runtime.abPopoverElements.endInput;
    inputElement.value = shared.formatTime(currentTime);
    await setAbPoint(kind);
  }

  async function applyTimeInput(kind) {
    await setAbPoint(kind);
  }

  async function clearAbLoop() {
    runtime.persistedState.startTime = null;
    runtime.persistedState.endTime = null;
    runtime.persistedState.abLoopEnabled = false;
    runtime.shouldCloseAbPopoverOnLeave = true;
    resetProgressAndNormalize();
    setDebugStatus("ab:clear");
    updateControls();
    await persistCurrentState();
  }

  async function cycleLoopLimit() {
    const currentLimit = loopEngine.getNormalizedLoopLimit(runtime.persistedState);
    const currentIndex = LOOP_LIMIT_OPTIONS.findIndex((option) => option === currentLimit);
    const nextOption = LOOP_LIMIT_OPTIONS[(currentIndex + 1) % LOOP_LIMIT_OPTIONS.length];

    runtime.persistedState = loopEngine.applyLoopLimitSelection(runtime.persistedState, nextOption);
    setDebugStatus("limit:set", nextOption === null ? "∞" : String(nextOption));
    applyLoopSettingsToCurrentVideo();
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
