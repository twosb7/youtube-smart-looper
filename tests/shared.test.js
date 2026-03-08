const assert = require("assert");

const shared = require("../src/shared.js");

function test(name, fn) {
  try {
    fn();
    console.log("PASS", name);
  } catch (error) {
    console.error("FAIL", name);
    throw error;
  }
}

test("parseVideoIdFromUrl extracts v from watch URL", () => {
  const videoId = shared.parseVideoIdFromUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
  assert.strictEqual(videoId, "dQw4w9WgXcQ");
});

test("parseVideoIdFromUrl rejects non-watch URL", () => {
  const videoId = shared.parseVideoIdFromUrl("https://www.youtube.com/results?search_query=test");
  assert.strictEqual(videoId, null);
});

test("makeStorageKey prefixes video id", () => {
  assert.strictEqual(shared.makeStorageKey("abc123"), "video:abc123");
});

test("normalizePersistedState restores fullLoopEnabled and clamps legacy A-B values", () => {
  const normalized = shared.normalizePersistedState(
    { fullLoopEnabled: true, enabled: true, startTime: -5, endTime: 999, loopLimit: 10 },
    { duration: 120 }
  );

  assert.deepStrictEqual(normalized, {
    fullLoopEnabled: true,
    abLoopEnabled: true,
    startTime: 0,
    endTime: 120,
    loopLimit: 10,
    completedLoops: 0,
  });
});

test("normalizePersistedState disables invalid legacy A-B ranges", () => {
  const normalized = shared.normalizePersistedState(
    { fullLoopEnabled: false, enabled: true, startTime: 40, endTime: 10 },
    { duration: 120 }
  );

  assert.deepStrictEqual(normalized, {
    fullLoopEnabled: false,
    abLoopEnabled: false,
    startTime: 40,
    endTime: 10,
    loopLimit: null,
    completedLoops: 0,
  });
});

test("formatTime returns mm:ss for whole seconds", () => {
  assert.strictEqual(shared.formatTime(125), "02:05");
});

test("parseTimeInput parses mm:ss", () => {
  assert.strictEqual(shared.parseTimeInput("03:15"), 195);
});

test("parseTimeInput parses h:mm:ss", () => {
  assert.strictEqual(shared.parseTimeInput("1:02:03"), 3723);
});

test("parseTimeInput rejects invalid input", () => {
  assert.strictEqual(shared.parseTimeInput("3:99"), null);
  assert.strictEqual(shared.parseTimeInput("abc"), null);
});

test("sanitizeTimeInputDraft keeps sequential digit entry stable", () => {
  let draft = "";

  for (const character of "600") {
    draft = shared.sanitizeTimeInputDraft(draft + character);
  }

  assert.strictEqual(draft, "600");
  assert.strictEqual(shared.parseTimeInput(draft), 360);

  draft = "";

  for (const character of "800") {
    draft = shared.sanitizeTimeInputDraft(draft + character);
  }

  assert.strictEqual(draft, "800");
  assert.strictEqual(shared.parseTimeInput(draft), 480);
});

test("sanitizeTimeInputDraft preserves manual colon input and strips noise", () => {
  assert.strictEqual(shared.sanitizeTimeInputDraft("1:02:03"), "1:02:03");
  assert.strictEqual(shared.sanitizeTimeInputDraft("ab12:3c4"), "12:34");
  assert.strictEqual(shared.sanitizeTimeInputDraft(":::12::34::56"), "12:34:56");
});

test("parseTimeInput accepts digit-only shorthand input", () => {
  assert.strictEqual(shared.parseTimeInput("1"), 1);
  assert.strictEqual(shared.parseTimeInput("123"), 83);
  assert.strictEqual(shared.parseTimeInput("12345"), 5025);
});
