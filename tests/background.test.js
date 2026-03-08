const assert = require("assert");

const background = require("../src/background.js");

function test(name, fn) {
  try {
    fn();
    console.log("PASS", name);
  } catch (error) {
    console.error("FAIL", name);
    throw error;
  }
}

test("isInjectableYouTubeUrl accepts https watch URLs", () => {
  assert.strictEqual(
    background.isInjectableYouTubeUrl("https://www.youtube.com/watch?v=abc123"),
    true
  );
  assert.strictEqual(
    background.isInjectableYouTubeUrl("https://youtube.com/watch?v=abc123"),
    true
  );
});

test("isInjectableYouTubeUrl rejects non-watch or non-youtube URLs", () => {
  assert.strictEqual(
    background.isInjectableYouTubeUrl("https://www.youtube.com/shorts/abc123"),
    false
  );
  assert.strictEqual(
    background.isInjectableYouTubeUrl("https://www.google.com/watch?v=abc123"),
    false
  );
  assert.strictEqual(background.isInjectableYouTubeUrl("not-a-url"), false);
});

test("ensureTabInjected skips non-injectable tabs", async () => {
  const calls = [];
  const runtime = background.createBackgroundRuntime({
    scripting: {
      executeScript: async () => {
        calls.push("execute");
        return [{ result: false }];
      },
    },
    tabs: {
      query: async () => [],
    },
    runtime: {
      onInstalled: { addListener: () => {} },
      onStartup: { addListener: () => {} },
    },
  });

  const injected = await runtime.ensureTabInjected({
    id: 1,
    url: "https://www.youtube.com/shorts/abc123",
  });

  assert.strictEqual(injected, false);
  assert.deepStrictEqual(calls, []);
});

test("ensureTabInjected skips tabs that already have the runtime", async () => {
  const calls = [];
  const runtime = background.createBackgroundRuntime({
    scripting: {
      executeScript: async (options) => {
        calls.push(options);
        if (options.func) {
          return [{ result: true }];
        }

        return [{ result: null }];
      },
    },
    tabs: {
      query: async () => [],
    },
    runtime: {
      onInstalled: { addListener: () => {} },
      onStartup: { addListener: () => {} },
    },
  });

  const injected = await runtime.ensureTabInjected({
    id: 1,
    url: "https://www.youtube.com/watch?v=abc123",
  });

  assert.strictEqual(injected, false);
  assert.strictEqual(calls.length, 1);
  assert.strictEqual(typeof calls[0].func, "function");
});

test("ensureTabInjected injects files when runtime is absent", async () => {
  const calls = [];
  const runtime = background.createBackgroundRuntime({
    scripting: {
      executeScript: async (options) => {
        calls.push(options);
        if (options.func) {
          return [{ result: false }];
        }

        return [{ result: null }];
      },
    },
    tabs: {
      query: async () => [],
    },
    runtime: {
      onInstalled: { addListener: () => {} },
      onStartup: { addListener: () => {} },
    },
  });

  const injected = await runtime.ensureTabInjected({
    id: 1,
    url: "https://www.youtube.com/watch?v=abc123",
  });

  assert.strictEqual(injected, true);
  assert.strictEqual(calls.length, 2);
  assert.ok(Array.isArray(calls[1].files));
});
