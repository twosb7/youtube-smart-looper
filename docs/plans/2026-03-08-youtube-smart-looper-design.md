# YouTube Smart Looper Design

**Date:** 2026-03-08

## Goal

Build a minimal Chrome Manifest V3 extension for modern YouTube watch pages that provides reliable full-video infinite loop with per-video persistence and robust SPA navigation recovery.

## MVP Scope

Included:
- Full-video loop on/off
- Small in-page panel near or below the player
- Per-video persistence using `video:<videoId>`
- Restore loop state when revisiting the same video
- Robust recovery for YouTube SPA navigation and `<video>` recreation

Deferred:
- A-B loop as primary UX
- Playback speed, shortcuts, playlists, Shorts support, analytics

## Architecture

- `src/content.js` is the primary runtime and UI surface
  - Controls the active `HTMLVideoElement`
  - Creates and updates the in-page panel
  - Loads and saves state
  - Handles SPA navigation and video recreation
- `popup.html` / `src/popup.js` are secondary and read-only
  - Show current status only
  - Tell the user that the main control is on the YouTube page
- `src/shared.js` contains pure utilities
  - message constants
  - `videoId` parsing
  - storage key creation
  - persisted state normalization
  - time formatting

## State Model

Storage key:

```text
video:<videoId>
```

Primary persisted state:

```json
{
  "fullLoopEnabled": true
}
```

Legacy-compatible fields may remain for future A-B support, but they do not drive the MVP UX.

## In-Page Panel

- The panel is created by the content script
- It renders inside a Shadow DOM root to isolate styling from YouTube
- The preferred placement is immediately below or near the player wrapper
- If no stable wrapper can be found, the panel falls back to a small fixed position at the bottom-right of the page
- The UI remains minimal, dark-theme friendly, and does not cover the video

## Loop Behavior

- When `fullLoopEnabled` is on and the video reaches `ended`
  - set `currentTime = 0`
  - attempt `play()`
- If `play()` is blocked, log a warning and keep the video rewound to `0`
- Initial restore does not force playback

## SPA and Video Recovery

Signals used:
- `yt-navigate-finish`
- `location.href` polling
- lightweight DOM observation

Recovery rules:
- On new `videoId`
  - detach previous video listeners
  - remove previous panel
  - load the new state
  - locate the new player
  - mount a new panel
- On `<video>` recreation for the same page
  - remove old listeners
  - attach to the new `HTMLVideoElement`
  - keep the same persisted `fullLoopEnabled` behavior

## Error Handling

- Non-watch pages stay inactive and do not show the main panel
- Missing or delayed `<video>` elements are handled by passive retry
- Storage read/write failures log warnings and avoid crashing the extension
- Invalid persisted values are normalized safely

## Manual Test Criteria

- Enable full loop on a watch page and confirm the video restarts from `0` when it ends
- Reload the same video and confirm the in-page panel restores the enabled state
- Navigate to another watch page via YouTube SPA and confirm state is isolated per `videoId`
- Cause player refresh or internal video recreation and confirm listeners are reattached without duplicate panels
- Visit non-watch pages and confirm the extension remains unobtrusive
