const assert = require("assert");

const panelRuntime = require("../src/panel-runtime.js");

function test(name, fn) {
  try {
    fn();
    console.log("PASS", name);
  } catch (error) {
    console.error("FAIL", name);
    throw error;
  }
}

test("canReusePanelMount reuses the same adjacent mount target", () => {
  const anchor = { id: "anchor" };
  const container = { id: "container" };

  const reusable = panelRuntime.canReusePanelMount(
    { hostConnected: true, placement: "adjacent", anchor: anchor, container: container },
    { placement: "adjacent", anchor: anchor, container: container }
  );

  assert.strictEqual(reusable, true);
});

test("canReusePanelMount rejects a different mount target", () => {
  const reusable = panelRuntime.canReusePanelMount(
    {
      hostConnected: true,
      placement: "adjacent",
      anchor: { id: "anchor-a" },
      container: { id: "container-a" },
    },
    {
      placement: "adjacent",
      anchor: { id: "anchor-b" },
      container: { id: "container-a" },
    }
  );

  assert.strictEqual(reusable, false);
});

test("canReusePanelMount rejects disconnected hosts", () => {
  const anchor = { id: "anchor" };
  const container = { id: "container" };

  const reusable = panelRuntime.canReusePanelMount(
    { hostConnected: false, placement: "adjacent", anchor: anchor, container: container },
    { placement: "adjacent", anchor: anchor, container: container }
  );

  assert.strictEqual(reusable, false);
});

test("canInsertBefore returns true only when anchor belongs to container", () => {
  const container = {};
  const anchor = { parentNode: container };

  assert.strictEqual(panelRuntime.canInsertBefore(container, anchor), true);
  assert.strictEqual(panelRuntime.canInsertBefore(container, { parentNode: {} }), false);
  assert.strictEqual(panelRuntime.canInsertBefore(container, null), false);
});

test("liftToDirectChild promotes nested matches to the direct child container entry", () => {
  const container = {};
  const directChild = { parentNode: container };
  const nestedChild = { parentNode: directChild };

  assert.strictEqual(panelRuntime.liftToDirectChild(container, nestedChild), directChild);
  assert.strictEqual(panelRuntime.liftToDirectChild(container, directChild), directChild);
  assert.strictEqual(panelRuntime.liftToDirectChild(container, { parentNode: {} }), null);
});

test("hasRenderableMountRect rejects collapsed mounts", () => {
  assert.strictEqual(panelRuntime.hasRenderableMountRect({ width: 220, height: 34 }), true);
  assert.strictEqual(panelRuntime.hasRenderableMountRect({ width: 10, height: 34 }), false);
  assert.strictEqual(panelRuntime.hasRenderableMountRect({ width: 220, height: 10 }), false);
});

test("isMountedInContainer checks only parent container", () => {
  const container = {};
  const host = { parentNode: container };

  assert.strictEqual(panelRuntime.isMountedInContainer(host, container), true);
  assert.strictEqual(panelRuntime.isMountedInContainer({ parentNode: {} }, container), false);
});

test("isMountedAtTarget checks parent and sibling placement", () => {
  const container = {};
  const anchor = {};
  const host = { parentNode: container, nextSibling: anchor };

  assert.strictEqual(panelRuntime.isMountedAtTarget(host, container, anchor), true);
  assert.strictEqual(panelRuntime.isMountedAtTarget(host, container, null), false);
  assert.strictEqual(panelRuntime.isMountedAtTarget({ parentNode: {}, nextSibling: anchor }, container, anchor), false);
});

test("isMountedAsExpected requires exact sibling placement when anchor exists", () => {
  const container = {};
  const anchor = {};

  assert.strictEqual(
    panelRuntime.isMountedAsExpected({ parentNode: container, nextSibling: anchor }, container, anchor),
    true
  );
  assert.strictEqual(
    panelRuntime.isMountedAsExpected({ parentNode: container, nextSibling: {} }, container, anchor),
    false
  );
  assert.strictEqual(
    panelRuntime.isMountedAsExpected({ parentNode: container }, container, null),
    true
  );
});
