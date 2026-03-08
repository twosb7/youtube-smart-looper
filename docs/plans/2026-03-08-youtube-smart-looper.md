# YouTube Smart Looper Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a minimal MV3 Chrome extension whose main UX is a player-adjacent in-page panel for full-video infinite loop on YouTube watch pages.

**Architecture:** The content script owns the UI, loop behavior, persistence, SPA recovery, and video lifecycle handling. The popup is secondary and read-only. Shared pure helpers stay isolated for future TypeScript migration and unit testing.

**Tech Stack:** Chrome Manifest V3, vanilla HTML/CSS/JavaScript, `chrome.storage.local`, Node built-in test runner via `assert`

---

### Task 1: Update shared state helpers

**Files:**
- Modify: `src/shared.js`
- Test: `tests/shared.test.js`

**Step 1: Write the failing test**

Cover:
- `videoId` parsing
- storage key generation
- normalization of `fullLoopEnabled`
- legacy-compatible A-B normalization

**Step 2: Run test to verify it fails**

Run: `node tests/shared.test.js`
Expected: FAIL because the new normalization helper does not exist yet

**Step 3: Write minimal implementation**

Add:
- `createDefaultState()`
- `normalizePersistedState()`

**Step 4: Run test to verify it passes**

Run: `node tests/shared.test.js`
Expected: PASS

### Task 2: Refactor content script into the primary UI

**Files:**
- Modify: `src/content.js`

**Step 1: Replace popup-first control flow**

Move the primary UX into the content script.

**Step 2: Add player-adjacent panel mounting**

Start from the active `<video>`, find a stable wrapper, insert a Shadow DOM host below it, and fall back to a small fixed panel if needed.

**Step 3: Add full-video loop behavior**

When `fullLoopEnabled` is true and the video ends, rewind to `0` and attempt `play()`.

**Step 4: Add SPA and video recreation recovery**

Combine `yt-navigate-finish`, URL polling, and DOM observation, while explicitly detaching and reattaching listeners.

### Task 3: Reduce the popup to secondary status

**Files:**
- Modify: `popup.html`
- Modify: `styles/popup.css`
- Modify: `src/popup.js`

**Step 1: Remove primary controls from the popup**

Keep only status and guidance text.

**Step 2: Show read-only loop and placement state**

Use `GET_LOOP_STATE` only.

### Task 4: Verify

**Files:**
- Test: `tests/shared.test.js`

**Step 1: Run automated checks**

Run:
- `node tests/shared.test.js`
- `node --check src/shared.js`
- `node --check src/content.js`
- `node --check src/popup.js`

**Step 2: Manual verification**

Load unpacked extension in Chrome and verify:
- full-video looping
- per-video restore
- SPA navigation recovery
- `<video>` recreation recovery
- non-watch page safety
