(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
    return;
  }

  root.YouTubeSmartLooperPanelRuntime = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  function canReusePanelMount(currentMount, nextMount) {
    if (!currentMount || !nextMount || !currentMount.hostConnected) {
      return false;
    }

    return (
      currentMount.placement === nextMount.placement &&
      currentMount.anchor === nextMount.anchor &&
      currentMount.container === nextMount.container
    );
  }

  function canInsertBefore(container, anchor) {
    return Boolean(container && anchor && anchor.parentNode === container);
  }

  function liftToDirectChild(container, element) {
    if (!container || !element) {
      return null;
    }

    let current = element;
    while (current && current.parentNode && current.parentNode !== container) {
      current = current.parentNode;
    }

    return current && current.parentNode === container ? current : null;
  }

  function hasRenderableMountRect(rect) {
    return Boolean(rect && rect.width >= 24 && rect.height >= 24);
  }

  function isMountedInContainer(host, container) {
    return Boolean(host && container && host.parentNode === container);
  }

  function isMountedAtTarget(host, container, anchor) {
    return Boolean(host && container && anchor && host.parentNode === container && host.nextSibling === anchor);
  }

  function isMountedAsExpected(host, container, anchor) {
    if (anchor) {
      return isMountedAtTarget(host, container, anchor);
    }

    return isMountedInContainer(host, container);
  }

  return {
    canReusePanelMount,
    canInsertBefore,
    liftToDirectChild,
    hasRenderableMountRect,
    isMountedInContainer,
    isMountedAtTarget,
    isMountedAsExpected,
  };
});
