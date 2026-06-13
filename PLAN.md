# Chrome 주석 확장 — 계획

긴 글을 **형광펜 치며 읽는 느낌**을 주는 크롬 확장(Manifest V3).

## 기능 (확정)

1. **코랄 배경 하이라이트** — 텍스트 선택 시 형광펜식 코랄 배경 (글자색 아님)
2. **빨간 네모 드래그 = 캡처** — 영역을 드래그해 빨간 테두리 박스, 그 영역을 이미지로 캡처
3. **AI 요약** — 주석 친 부분을 중점으로 페이지 요약 (AI 게이트웨이)
4. **캡처 이미지 Q&A** — 캡처한 이미지를 AI에 올려 질문 (비전)
5. **아카이빙** — PDF → 마크다운 → Notion 순

## 결정사항

| 항목 | 결정 | 이유 |
|---|---|---|
| 주석 저장 | **세션만** (재방문 복원 X) | 텍스트 위치 앵커링 난제 회피 |
| AI 백엔드 | AI 게이트웨이 | 보유 키. OpenAI 호환 chat+vision 실측 확인 |
| 모델 | 요약=Claude/GPT, 이미지=Gemini/GPT 비전 | 게이트웨이 41종 제공 |
| 스택 | 순수 JS, 빌드 없음 | unpacked 로드로 바로 반복 |
| 캡처 | captureVisibleTab + canvas 크롭 | 가시영역 찍고 영역만 오림 |
| PDF | HTML → 브라우저 인쇄 | 한글 폰트 임베드 회피 |
| API 호출 | background service worker | CORS 우회 (+ host_permissions) |
| 키 저장 | 옵션 페이지 → chrome.storage.local | 코드 하드코딩 금지 |

## 구조

```
manifest.json
src/
  content/   content.js  content.css   # 주석 그리기·관리
  background/ worker.js                 # 캡처 + 게이트웨이 호출
  ui/        (도구막대는 content가 주입)
  lib/       capture.js export.js ai.js # 단계별 추가
options.html / options.js               # API 키 입력
```

## 로드맵 (단계 = 검증 기준)

- [ ] **1. 주석 MVP** — 텍스트 선택 시 코랄 배경, 드래그 시 빨간 박스, 지우개
  - 검증: 임의 웹페이지에서 두 주석 + 지우기 동작
- [ ] **2. 캡처 저장** — 네모 영역 PNG 크롭 → 다운로드/클립보드
  - 검증: 저장 이미지가 드래그 영역과 일치
- [ ] **3. 내보내기** — 주석+캡처를 PDF(인쇄)/마크다운(클립보드)
  - 검증: 출력물에 인용+이미지 포함
- [ ] **4. AI 요약** — 주석을 `[강조]` 표시해 게이트웨이 전송, 주석 중점 요약 + 이미지 Q&A
  - 검증: 요약이 형광펜 친 문장 중심
- [ ] **5. Notion** — 통합 토큰으로 페이지 생성
  - 검증: Notion에 페이지 생성

## 게이트웨이 메모 (2026-06-13 실측)

- 베이스: `https://factchat-cloud.mindlogic.ai/v1/gateway`
- `/chat/completions` OpenAI 호환. 비전: `image_url` data URI 입력 → `gemini-2.5-flash`, `gpt-5-mini` 정상
- 키: `~/.claude/.secrets/jbnu-gateway.key` (확장에선 옵션 페이지로 별도 입력)
