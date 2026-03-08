(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
    return;
  }

  root.YouTubeSmartLooperLoopEngine = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  function hasValidAbLoop(state) {
    return (
      Boolean(state && state.abLoopEnabled) &&
      Number.isFinite(state && state.startTime) &&
      Number.isFinite(state && state.endTime) &&
      state.endTime > state.startTime
    );
  }

  function getActiveLoopMode(state) {
    if (!state || !state.fullLoopEnabled) {
      return "off";
    }

    if (hasValidAbLoop(state)) {
      return "ab";
    }

    return "full";
  }

  function getNormalizedLoopLimit(state) {
    const limit = Number(state && state.loopLimit);
    if (!Number.isFinite(limit) || limit < 1) {
      return null;
    }

    return Math.floor(limit);
  }

  function getWrapTarget(options) {
    const state = options && options.state;
    const currentTime = Number(options && options.currentTime);
    const duration = Number(options && options.duration);
    const thresholdSeconds = Number.isFinite(options && options.thresholdSeconds)
      ? options.thresholdSeconds
      : 0.2;
    const mode = getActiveLoopMode(state);

    if (mode === "off") {
      return null;
    }

    if (mode === "ab") {
      if (!Number.isFinite(currentTime)) {
        return null;
      }

      return currentTime >= state.endTime - thresholdSeconds ? state.startTime : null;
    }

    if (!Number.isFinite(currentTime) || !Number.isFinite(duration) || duration <= 0) {
      return null;
    }

    return currentTime >= duration - thresholdSeconds ? 0 : null;
  }

  function shouldHandleWrapInTimeupdate(state) {
    return getActiveLoopMode(state) !== "off";
  }

  function recordLoopIteration(state) {
    const nextState = Object.assign({}, state);
    const nextCompletedLoops = Number.isFinite(nextState.completedLoops) ? nextState.completedLoops + 1 : 1;
    const loopLimit = getNormalizedLoopLimit(nextState);

    nextState.completedLoops = nextCompletedLoops;

    if (loopLimit !== null && nextCompletedLoops >= loopLimit) {
      nextState.fullLoopEnabled = false;
    }

    return nextState;
  }

  function resetLoopProgress(state) {
    return Object.assign({}, state, { completedLoops: 0 });
  }

  function toggleInfiniteLoop(state) {
    const source = Object.assign({}, state);
    const mode = getActiveLoopMode(source);
    const isInfiniteMode = mode === "full" && getNormalizedLoopLimit(source) === null;

    if (isInfiniteMode) {
      source.fullLoopEnabled = false;
      source.completedLoops = 0;
      return source;
    }

    source.fullLoopEnabled = true;
    source.abLoopEnabled = false;
    source.loopLimit = null;
    source.completedLoops = 0;
    return source;
  }

  function applyAbLoopInput(state) {
    const source = Object.assign({}, state);
    const validAbLoop =
      Number.isFinite(source.startTime) &&
      Number.isFinite(source.endTime) &&
      source.endTime > source.startTime;

    source.completedLoops = 0;

    if (!validAbLoop) {
      source.abLoopEnabled = false;
      source.fullLoopEnabled = false;
      return source;
    }

    source.fullLoopEnabled = true;
    source.abLoopEnabled = true;
    return source;
  }

  function applyLoopLimitSelection(state, nextLimit) {
    const source = Object.assign({}, state);
    const normalizedLimit =
      Number.isFinite(nextLimit) && nextLimit >= 1 ? Math.floor(nextLimit) : null;

    source.loopLimit = normalizedLimit;
    source.completedLoops = 0;

    if (normalizedLimit !== null) {
      source.fullLoopEnabled = true;
    }

    return source;
  }

  return {
    hasValidAbLoop,
    getActiveLoopMode,
    getNormalizedLoopLimit,
    getWrapTarget,
    shouldHandleWrapInTimeupdate,
    recordLoopIteration,
    resetLoopProgress,
    toggleInfiniteLoop,
    applyAbLoopInput,
    applyLoopLimitSelection,
  };
});
