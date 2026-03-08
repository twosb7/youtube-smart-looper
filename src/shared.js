(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
    return;
  }

  root.YouTubeSmartLooperShared = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const MESSAGE_TYPES = {
    GET_LOOP_STATE: "GET_LOOP_STATE",
  };

  function parseVideoIdFromUrl(url) {
    try {
      const parsedUrl = new URL(url);
      const isYouTubeHost =
        parsedUrl.hostname === "www.youtube.com" || parsedUrl.hostname === "youtube.com";

      if (!isYouTubeHost || parsedUrl.pathname !== "/watch") {
        return null;
      }

      const videoId = parsedUrl.searchParams.get("v");
      return videoId ? videoId.trim() || null : null;
    } catch (error) {
      return null;
    }
  }

  function isYouTubeWatchPage(url) {
    return parseVideoIdFromUrl(url) !== null;
  }

  function makeStorageKey(videoId) {
    return "video:" + videoId;
  }

  function clampNumber(value, min, max) {
    if (!Number.isFinite(value)) {
      return null;
    }

    return Math.min(max, Math.max(min, value));
  }

  function createDefaultState() {
    return {
      fullLoopEnabled: false,
      abLoopEnabled: false,
      startTime: null,
      endTime: null,
      loopLimit: null,
      completedLoops: 0,
    };
  }

  function normalizePersistedState(loopState, options) {
    const source = loopState || {};
    const duration = Number.isFinite(options && options.duration) && options.duration > 0
      ? options.duration
      : Number.POSITIVE_INFINITY;
    const startTime = clampNumber(Number(source.startTime), 0, duration);
    const endTime = clampNumber(Number(source.endTime), 0, duration);
    const abLoopEnabledSource = Object.prototype.hasOwnProperty.call(source, "abLoopEnabled")
      ? source.abLoopEnabled
      : source.enabled;
    const loopLimit = Number(source.loopLimit);
    const hasValidRange =
      startTime !== null &&
      endTime !== null &&
      Number.isFinite(startTime) &&
      Number.isFinite(endTime) &&
      endTime > startTime;

    return {
      fullLoopEnabled: Boolean(source.fullLoopEnabled),
      abLoopEnabled: Boolean(abLoopEnabledSource) && hasValidRange,
      startTime,
      endTime,
      loopLimit: Number.isFinite(loopLimit) && loopLimit >= 1 ? Math.floor(loopLimit) : null,
      completedLoops: 0,
    };
  }

  function formatTime(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) {
      return "--:--";
    }

    const totalSeconds = Math.floor(seconds);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor(totalSeconds / 60);
    const remainingSeconds = totalSeconds % 60;

    if (hours > 0) {
      const remainingMinutes = Math.floor((totalSeconds % 3600) / 60);
      return (
        String(hours).padStart(2, "0") +
        ":" +
        String(remainingMinutes).padStart(2, "0") +
        ":" +
        String(remainingSeconds).padStart(2, "0")
      );
    }

    return String(minutes).padStart(2, "0") + ":" + String(remainingSeconds).padStart(2, "0");
  }

  function parseTimeInput(value) {
    if (typeof value !== "string") {
      return null;
    }

    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }

    if (/^\d+$/.test(trimmed)) {
      const digits = trimmed.slice(-6);
      const seconds = Number(digits.slice(-2) || 0);
      const minutes = Number(digits.slice(-4, -2) || 0);
      const hours = Number(digits.slice(0, -4) || 0);
      return hours * 3600 + minutes * 60 + seconds;
    }

    const segments = trimmed.split(":");
    if (segments.length < 2 || segments.length > 3) {
      return null;
    }

    const numbers = segments.map((segment) => Number(segment));
    if (numbers.some((segment) => !Number.isInteger(segment) || segment < 0)) {
      return null;
    }

    if (numbers[segments.length - 1] >= 60 || numbers[segments.length - 2] >= 60) {
      return null;
    }

    if (segments.length === 2) {
      return numbers[0] * 60 + numbers[1];
    }

    return numbers[0] * 3600 + numbers[1] * 60 + numbers[2];
  }

  function formatTimeInputDraft(value) {
    if (typeof value !== "string") {
      return "";
    }

    const digits = value.replace(/\D/g, "").slice(-6);
    if (!digits) {
      return "";
    }

    const seconds = Number(digits.slice(-2) || 0);
    const minutes = Number(digits.slice(-4, -2) || 0);
    const hours = Number(digits.slice(0, -4) || 0);
    return formatTime(hours * 3600 + minutes * 60 + seconds);
  }

  return {
    MESSAGE_TYPES,
    createDefaultState,
    parseVideoIdFromUrl,
    isYouTubeWatchPage,
    makeStorageKey,
    normalizePersistedState,
    formatTime,
    formatTimeInputDraft,
    parseTimeInput,
  };
});
