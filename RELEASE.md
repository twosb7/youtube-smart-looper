# Release Structure

Recommended public release flow:

1. Push the source repository to GitHub
2. Create a GitHub Release such as `v0.1.0`
3. Attach one installable ZIP for Chrome manual loading
4. Keep the repository source and the release ZIP aligned

## Release ZIP

Recommended file name:

```text
youtube-smart-looper-v0.1.0.zip
```

Recommended ZIP contents:

```text
manifest.json
popup.html
styles/
assets/
src/
```

Do not include:

```text
tests/
docs/
.git/
.DS_Store
```

## Suggested GitHub Release Body

```text
YouTube Smart Looper v0.1.0

Features
- Full-video infinite loop
- A-B loop
- Loop count limit
- Per-video saved state

Installation
1. Download the ZIP asset
2. Extract it
3. Open chrome://extensions
4. Enable Developer mode
5. Click Load unpacked
6. Select the extracted folder
```

## Suggested Repository Files Before Public Push

- `README.md`
- `LICENSE`
- `manifest.json`
- extension source files
- icons
- at least 2-3 screenshots

## Screenshot Suggestions

- Player controls visible with the Smart Looper buttons
- A-B popover open
- Infinite loop on
- A-B loop configured with start/end values

## Optional Packaging Command

Run this from the project root after removing unwanted files from the archive input:

```bash
zip -r youtube-smart-looper-v0.1.0.zip manifest.json popup.html styles assets src
```
