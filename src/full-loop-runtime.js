(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
    return;
  }

  root.YouTubeSmartLooperFullLoopRuntime = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const DEFAULT_WRAP_THRESHOLD_SECONDS = 0.2;

  function syncNativeLoop(video, enabled) {
    if (!video) {
      return;
    }

    video.loop = Boolean(enabled);
  }

  function shouldWrapToBeginning(options) {
    const fullLoopEnabled = Boolean(options && options.fullLoopEnabled);
    const currentTime = Number(options && options.currentTime);
    const duration = Number(options && options.duration);
    const threshold = Number.isFinite(options && options.thresholdSeconds)
      ? options.thresholdSeconds
      : DEFAULT_WRAP_THRESHOLD_SECONDS;

    if (!fullLoopEnabled || !Number.isFinite(currentTime) || !Number.isFinite(duration) || duration <= 0) {
      return false;
    }

    return currentTime >= Math.max(0, duration - threshold);
  }

  async function restartVideoFromBeginning(video) {
    if (!video) {
      return;
    }

    video.currentTime = 0;

    if (typeof video.play !== "function") {
      return;
    }

    await video.play();
  }

  return {
    syncNativeLoop,
    shouldWrapToBeginning,
    restartVideoFromBeginning,
  };
});
