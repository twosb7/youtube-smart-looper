# YouTube Smart Looper

현대적인 YouTube watch 페이지에서 동작하는 크롬 Manifest V3 확장 프로그램입니다.

플레이어 안쪽에 가벼운 반복 컨트롤을 추가해서 다음 기능을 제공합니다.

- 전체 영상 무한 반복
- A-B 구간 반복
- 반복 횟수 제한
- 영상별 설정 저장

popup은 보조 UI이고, 실제 동작과 메인 UI는 content script가 담당합니다.

## 주요 기능

- 최신 YouTube watch 페이지 대응
- 활성 `HTMLVideoElement` 직접 제어
- YouTube SPA 내비게이션 대응
- `chrome.storage.local` 기반 저장
- `videoId` 기준 A/B 구간, 반복 제한값 저장
- 페이지 진입 시 항상 `Loop Off` 상태로 시작

## 현재 동작 방식

- 기본 기능은 전체 반복입니다
- 유효한 A-B 구간이 있고 루프를 켜면 A-B 반복이 우선합니다
- A-B 팝업은 플레이어 영역 기준으로 표시됩니다
- 저장 키는 `video:<videoId>` 형식입니다

## 설치 방법

현재는 Chrome에서 수동 설치 방식으로 사용하는 것을 기준으로 합니다.

1. 이 저장소를 ZIP으로 받거나 clone합니다
2. `chrome://extensions`를 엽니다
3. `개발자 모드`를 켭니다
4. `압축해제된 확장 프로그램을 로드합니다`를 누릅니다
5. 이 프로젝트 폴더를 선택합니다

## 프로젝트 구조

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

## 개발 메모

- 빌드 도구 없음
- TypeScript 없음
- 순수 HTML / CSS / JavaScript
- Manifest V3

## 수동 테스트 체크리스트

- 전체 반복 on/off가 정상 동작하는지
- A-B 구간이 설정되면 `A Start`로 이동한 뒤 반복되는지
- 반복 횟수 제한 도달 후 자동으로 멈추는지
- 재방문 시 A/B 값은 복원되지만 처음 진입은 `Loop Off`인지
- YouTube SPA 이동 후에도 버튼과 상태가 정상인지

## 배포

GitHub Release 구성은 [RELEASE.ko.md](./RELEASE.ko.md)를 참고하면 됩니다.

## 라이선스

공개 배포 전에는 라이선스를 추가하는 것을 권장합니다. 가장 단순한 선택지는 `MIT`입니다.
