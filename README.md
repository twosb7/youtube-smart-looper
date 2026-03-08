# YouTube Smart Looper

Minimal Chrome Manifest V3 extension for looping YouTube videos on modern watch pages.

It adds lightweight in-player controls for:

- Infinite full-video loop
- A-B loop
- Loop count limit
- Per-video saved state

The popup is secondary. The content script is the main UI and loop controller.

## Features

- Works on modern YouTube watch pages
- Uses the active `HTMLVideoElement` directly
- Handles YouTube SPA navigation
- Persists settings with `chrome.storage.local`
- Restores saved A/B markers and loop limit per `videoId`
- Always opens in `Loop Off` mode on page entry

## Current Behavior

- Full loop is the primary mode
- If a valid A-B range is configured and loop is enabled, A-B loop takes priority
- A-B popover opens near the player area
- Saved values are keyed by `video:<videoId>`

## Install

This project is currently intended for manual installation in Chrome.

1. Download this repository as a ZIP, or clone it.
2. Open `chrome://extensions`
3. Enable `Developer mode`
4. Click `Load unpacked`
5. Select the project folder

## Project Structure

```text
manifest.json
popup.html
styles/popup.css
assets/icons/
src/
tests/
```

Key runtime files:

- `src/content.js`: in-page UI, video control, SPA handling
- `src/loop-engine.js`: loop mode/state rules
- `src/shared.js`: shared parsing, storage-key, formatting helpers
- `src/background.js`: reinjection safety for YouTube tabs
- `src/popup.js`: secondary popup status view

## Development Notes

- No build tool
- No TypeScript
- Plain HTML / CSS / JavaScript only
- Manifest V3

## Manual Test Checklist

- Infinite loop toggles on/off correctly
- A-B loop starts from `A Start` after both markers are valid
- Loop limit stops looping after the configured repeat count
- Saved markers restore on revisit, but page entry starts in `Loop Off`
- Controls survive YouTube SPA navigation

## Packaging

See [RELEASE.md](./RELEASE.md) for the recommended GitHub release layout.

## License

Add a license before publishing publicly. `MIT` is the simplest option if you want open reuse.
