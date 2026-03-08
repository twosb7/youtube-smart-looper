# 배포 구조

권장 공개 배포 순서는 아래와 같습니다.

1. GitHub에 소스 저장소를 public으로 올립니다
2. `v0.1.1` 같은 GitHub Release를 만듭니다
3. Chrome 수동 설치용 ZIP 파일을 첨부합니다
4. 저장소 소스와 Release ZIP의 내용을 맞춥니다

## Release ZIP

권장 파일명:

```text
youtube-smart-looper-v0.1.1.zip
```

권장 포함 파일:

```text
manifest.json
popup.html
styles/
assets/
src/
```

제외 권장:

```text
tests/
docs/
.git/
.DS_Store
```

## GitHub Release 본문 예시

```text
YouTube Smart Looper v0.1.1

주요 기능
- 전체 영상 무한 반복
- A-B 구간 반복
- 반복 횟수 제한
- 영상별 설정 저장

설치 방법
1. ZIP 파일을 다운로드합니다
2. 압축을 풉니다
3. chrome://extensions 를 엽니다
4. 개발자 모드를 켭니다
5. 압축해제된 확장 프로그램 로드를 누릅니다
6. 압축 해제한 폴더를 선택합니다
```

## 공개 전 권장 파일

- `README.md`
- `README.ko.md`
- `LICENSE`
- `manifest.json`
- 확장 소스 파일
- 아이콘
- 스크린샷 2~3장

## 스크린샷 추천

- 플레이어 컨트롤에 Smart Looper 버튼이 붙은 화면
- A-B 팝업이 열린 화면
- Infinite loop 활성 화면
- A/B 시작/끝 값이 설정된 화면

## ZIP 생성 예시

프로젝트 루트에서 아래처럼 만들면 됩니다.

```bash
zip -r youtube-smart-looper-v0.1.1.zip manifest.json popup.html styles assets src
```
