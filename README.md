# YouTube Smart Looper

한국어 문서는 아래부터 바로 읽으면 됩니다.  
English version is available after the Korean section.

---

## 한국어

현대적인 YouTube watch 페이지에서 동작하는 크롬 Manifest V3 확장 프로그램입니다.

플레이어 안쪽에 가벼운 반복 컨트롤을 추가해서 다음 기능을 제공합니다.

- 전체 영상 무한 반복
- A-B 구간 반복
- 반복 횟수 제한
- 영상별 설정 저장

popup은 보조 UI이고, 실제 동작과 메인 UI는 content script가 담당합니다.

### 빠른 설치

가장 쉬운 방법은 GitHub Release에서 ZIP을 받아서 설치하는 것입니다.

- Release 페이지: [v0.1.0](https://github.com/twosb7/youtube-smart-looper/releases/tag/v0.1.0)
- ZIP 다운로드: [youtube-smart-looper-v0.1.0.zip](https://github.com/twosb7/youtube-smart-looper/releases/download/v0.1.0/youtube-smart-looper-v0.1.0.zip)

### 주요 기능

- 최신 YouTube watch 페이지 대응
- 활성 `HTMLVideoElement` 직접 제어
- YouTube SPA 내비게이션 대응
- `chrome.storage.local` 기반 저장
- `videoId` 기준 A/B 구간, 반복 제한값 저장
- 페이지 진입 시 항상 `Loop Off` 상태로 시작

### 현재 동작 방식

- 기본 기능은 전체 반복입니다
- 유효한 A-B 구간이 있고 루프를 켜면 A-B 반복이 우선합니다
- A-B 팝업은 플레이어 영역 기준으로 표시됩니다
- 저장 키는 `video:<videoId>` 형식입니다

### 설치 방법

현재는 Chrome에서 수동 설치 방식으로 사용하는 것을 기준으로 합니다.

1. Release ZIP을 다운로드하거나 저장소를 clone합니다
2. ZIP을 받았다면 압축을 풉니다
3. `chrome://extensions`를 엽니다
4. `개발자 모드`를 켭니다
5. `압축해제된 확장 프로그램을 로드합니다`를 누릅니다
6. 압축을 푼 폴더 또는 프로젝트 폴더를 선택합니다

설치 후:

1. YouTube watch 페이지를 엽니다
2. 플레이어 오른쪽 컨트롤 영역에서 Smart Looper 버튼을 확인합니다
3. `Loop`, `A-B`, 반복 횟수 제한 기능을 사용합니다

### 프로젝트 구조

```text
manifest.json
popup.html
styles/popup.css
assets/icons/
src/
tests/
```

핵심 파일:

- `src/content.js`: 인페이지 UI, 비디오 제어, SPA 대응
- `src/loop-engine.js`: 반복 모드/상태 규칙
- `src/shared.js`: 파싱, 저장 키, 포맷 유틸
- `src/background.js`: YouTube 탭 재주입 안전장치
- `src/popup.js`: 보조 popup 상태 화면

### 개발 메모

- 빌드 도구 없음
- TypeScript 없음
- 순수 HTML / CSS / JavaScript
- Manifest V3

### 수동 테스트 체크리스트

- 전체 반복 on/off가 정상 동작하는지
- A-B 구간이 설정되면 `A Start`로 이동한 뒤 반복되는지
- 반복 횟수 제한 도달 후 자동으로 멈추는지
- 재방문 시 A/B 값은 복원되지만 처음 진입은 `Loop Off`인지
- YouTube SPA 이동 후에도 버튼과 상태가 정상인지

### 배포

GitHub Release 구성은 [RELEASE.ko.md](./RELEASE.ko.md)를 참고하면 됩니다.

### 라이선스

현재 라이선스는 `MIT`입니다.

---

## English

Minimal Chrome Manifest V3 extension for looping YouTube videos on modern watch pages.

It adds lightweight in-player controls for:

- Infinite full-video loop
- A-B loop
- Loop count limit
- Per-video saved state

The popup is secondary. The content script is the main UI and loop controller.

### Quick Install

The easiest way is to download the release ZIP and load it in Chrome.

- Release page: [v0.1.0](https://github.com/twosb7/youtube-smart-looper/releases/tag/v0.1.0)
- ZIP download: [youtube-smart-looper-v0.1.0.zip](https://github.com/twosb7/youtube-smart-looper/releases/download/v0.1.0/youtube-smart-looper-v0.1.0.zip)

### Features

- Works on modern YouTube watch pages
- Uses the active `HTMLVideoElement` directly
- Handles YouTube SPA navigation
- Persists settings with `chrome.storage.local`
- Restores saved A/B markers and loop limit per `videoId`
- Always opens in `Loop Off` mode on page entry

### Current Behavior

- Full loop is the primary mode
- If a valid A-B range is configured and loop is enabled, A-B loop takes priority
- A-B popover opens near the player area
- Saved values are keyed by `video:<videoId>`

### Install

This project is currently intended for manual installation in Chrome.

1. Download the release ZIP or clone this repository
2. If you downloaded the ZIP, extract it
3. Open `chrome://extensions`
4. Enable `Developer mode`
5. Click `Load unpacked`
6. Select the extracted folder or the project folder

After installation:

1. Open a YouTube watch page
2. Find the Smart Looper controls near the player controls
3. Use `Loop`, `A-B`, and the repeat limit controls

### Project Structure

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

### Development Notes

- No build tool
- No TypeScript
- Plain HTML / CSS / JavaScript only
- Manifest V3

### Manual Test Checklist

- Infinite loop toggles on/off correctly
- A-B loop starts from `A Start` after both markers are valid
- Loop limit stops looping after the configured repeat count
- Saved markers restore on revisit, but page entry starts in `Loop Off`
- Controls survive YouTube SPA navigation

### Packaging

See [RELEASE.md](./RELEASE.md) for the recommended GitHub release layout.

### License

This project is licensed under the `MIT` License.
