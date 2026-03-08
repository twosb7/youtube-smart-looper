const assert = require("assert");

const fullLoopRuntime = require("../src/full-loop-runtime.js");

function test(name, fn) {
  try {
    fn();
    console.log("PASS", name);
  } catch (error) {
    console.error("FAIL", name);
    throw error;
  }
}

test("syncNativeLoop sets the video loop property from fullLoopEnabled", () => {
  const video = { loop: false };

  fullLoopRuntime.syncNativeLoop(video, true);
  assert.strictEqual(video.loop, true);

  fullLoopRuntime.syncNativeLoop(video, false);
  assert.strictEqual(video.loop, false);
});

test("restartVideoFromBeginning rewinds before attempting playback", async () => {
  const calls = [];
  const video = {
    currentTime: 42,
    play() {
      calls.push("play");
      return Promise.resolve();
    },
  };

  await fullLoopRuntime.restartVideoFromBeginning(video);

  assert.strictEqual(video.currentTime, 0);
  assert.deepStrictEqual(calls, ["play"]);
});

test("shouldWrapToBeginning returns true near the natural end of the video", () => {
  const shouldWrap = fullLoopRuntime.shouldWrapToBeginning({
    fullLoopEnabled: true,
    currentTime: 9.92,
    duration: 10,
  });

  assert.strictEqual(shouldWrap, true);
});

test("shouldWrapToBeginning returns false when loop is off", () => {
  const shouldWrap = fullLoopRuntime.shouldWrapToBeginning({
    fullLoopEnabled: false,
    currentTime: 9.92,
    duration: 10,
  });

  assert.strictEqual(shouldWrap, false);
});
