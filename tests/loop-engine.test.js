const assert = require("assert");

const loopEngine = require("../src/loop-engine.js");

function test(name, fn) {
  try {
    fn();
    console.log("PASS", name);
  } catch (error) {
    console.error("FAIL", name);
    throw error;
  }
}

test("getActiveLoopMode prefers A-B when enabled and valid", () => {
  const mode = loopEngine.getActiveLoopMode({
    fullLoopEnabled: true,
    abLoopEnabled: true,
    startTime: 5,
    endTime: 8,
  });

  assert.strictEqual(mode, "ab");
});

test("getActiveLoopMode falls back to full loop", () => {
  const mode = loopEngine.getActiveLoopMode({
    fullLoopEnabled: true,
    abLoopEnabled: false,
    startTime: null,
    endTime: null,
  });

  assert.strictEqual(mode, "full");
});

test("getWrapTarget returns A when current time reaches B", () => {
  const target = loopEngine.getWrapTarget({
    state: {
      fullLoopEnabled: true,
      abLoopEnabled: true,
      startTime: 3,
      endTime: 7,
      loopLimit: 10,
    },
    currentTime: 6.85,
    duration: 20,
    thresholdSeconds: 0.2,
  });

  assert.strictEqual(target, 3);
});

test("getWrapTarget returns 0 near full-video end when limit is active", () => {
  const target = loopEngine.getWrapTarget({
    state: {
      fullLoopEnabled: true,
      abLoopEnabled: false,
      startTime: null,
      endTime: null,
      loopLimit: 3,
    },
    currentTime: 19.85,
    duration: 20,
    thresholdSeconds: 0.2,
  });

  assert.strictEqual(target, 0);
});

test("recordLoopIteration turns loop off when the limit is reached", () => {
  const nextState = loopEngine.recordLoopIteration({
    fullLoopEnabled: true,
    abLoopEnabled: true,
    startTime: 2,
    endTime: 4,
    loopLimit: 2,
    completedLoops: 1,
  });

  assert.deepStrictEqual(nextState, {
    fullLoopEnabled: false,
    abLoopEnabled: true,
    startTime: 2,
    endTime: 4,
    loopLimit: 2,
    completedLoops: 2,
  });
});

test("shouldHandleWrapInTimeupdate is true for full infinite loop", () => {
  const shouldHandle = loopEngine.shouldHandleWrapInTimeupdate({
    fullLoopEnabled: true,
    abLoopEnabled: false,
    startTime: null,
    endTime: null,
    loopLimit: null,
  });

  assert.strictEqual(shouldHandle, true);
});

test("toggleInfiniteLoop promotes limited loop into infinite loop mode", () => {
  const nextState = loopEngine.toggleInfiniteLoop({
    fullLoopEnabled: true,
    abLoopEnabled: true,
    startTime: 12,
    endTime: 18,
    loopLimit: 10,
    completedLoops: 4,
  });

  assert.deepStrictEqual(nextState, {
    fullLoopEnabled: true,
    abLoopEnabled: false,
    startTime: 12,
    endTime: 18,
    loopLimit: null,
    completedLoops: 0,
  });
});

test("toggleInfiniteLoop turns infinite loop off when already infinite", () => {
  const nextState = loopEngine.toggleInfiniteLoop({
    fullLoopEnabled: true,
    abLoopEnabled: false,
    startTime: null,
    endTime: null,
    loopLimit: null,
    completedLoops: 0,
  });

  assert.deepStrictEqual(nextState, {
    fullLoopEnabled: false,
    abLoopEnabled: false,
    startTime: null,
    endTime: null,
    loopLimit: null,
    completedLoops: 0,
  });
});

test("applyAbLoopInput enables A-B looping when the range is valid", () => {
  const nextState = loopEngine.applyAbLoopInput({
    fullLoopEnabled: false,
    abLoopEnabled: false,
    startTime: 12,
    endTime: 18,
    loopLimit: null,
    completedLoops: 3,
  });

  assert.deepStrictEqual(nextState, {
    fullLoopEnabled: true,
    abLoopEnabled: true,
    startTime: 12,
    endTime: 18,
    loopLimit: null,
    completedLoops: 0,
  });
});

test("applyAbLoopInput turns looping off when an active A-B range becomes invalid", () => {
  const nextState = loopEngine.applyAbLoopInput({
    fullLoopEnabled: true,
    abLoopEnabled: true,
    startTime: 18,
    endTime: 12,
    loopLimit: null,
    completedLoops: 2,
  });

  assert.deepStrictEqual(nextState, {
    fullLoopEnabled: false,
    abLoopEnabled: false,
    startTime: 18,
    endTime: 12,
    loopLimit: null,
    completedLoops: 0,
  });
});

test("applyLoopLimitSelection enables looping when a finite limit is selected", () => {
  const nextState = loopEngine.applyLoopLimitSelection({
    fullLoopEnabled: false,
    abLoopEnabled: true,
    startTime: 12,
    endTime: 18,
    loopLimit: null,
    completedLoops: 1,
  }, 3);

  assert.deepStrictEqual(nextState, {
    fullLoopEnabled: true,
    abLoopEnabled: true,
    startTime: 12,
    endTime: 18,
    loopLimit: 3,
    completedLoops: 0,
  });
});
