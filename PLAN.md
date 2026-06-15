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

- [x] **1. 주석 MVP** — 텍스트 선택 시 코랄 배경, 드래그 시 빨간 박스, 지우개
  - 검증: 임의 웹페이지에서 두 주석 + 지우기 동작
- [x] **2. 캡처 저장** — 네모 영역 PNG 크롭 (AI/요약/PDF/이미지복사용으로 유지)
  - 검증: 캡처 이미지가 드래그 영역과 일치
- [x] **3. 내보내기** — 주석+캡처를 PDF(인쇄). '주석' 버튼이 정리 미리보기 패널 → 패널 💾로 인쇄
  - 검증: 출력물에 인용+이미지 포함
- [x] **4. AI 요약** — 주석을 `★` 표시해 게이트웨이 전송, 주석 중점 요약 + 이미지 Q&A
  - 검증: 요약이 형광펜 친 문장 중심
- [x] **5. Notion** — 통합 토큰 + 부모 페이지 아래 **인박스 DB 자동 생성** 후 저장마다 행(row) 추가(인용문+캡처+요약, 메타데이터는 DB 속성)
  - 검증: 📝 Notion 버튼 → 부모 페이지 아래 DB에 행 생성, 주석·이미지·속성 저장 (실조건 확인)
- [x] **6. UI/UX 개편 (0.3.0)** — '정리·AI' 통합 패널(하위탭: 주석 정리 / AI 요약), 주석 정리 실시간 반영, AI 요약 결과 캐시 + 🔄 다시하기, 전체삭제를 hover 미니툴바로 통합, 단축키 Alt+1~5(백틱=툴바 토글)
  - 검증: 통합 패널 토글·실시간 반영·캐시 동작, 주석정리 순서 == Notion 본문 순서
- [~] **7. 다중 PC 같은 DB 연결 (0.3.1)** — DB 확보 시 로컬 캐시 없으면 부모 페이지에서 기존 인박스 DB(제목 매칭)를 탐색해 0개=생성/1개=재사용/2개+=옵션 페이지에서 선택. 다른 PC도 같은 부모 페이지 ID 면 같은 DB 에 연결됨(로컬 캐시 비의존).
  - 검증: 신규생성 경로 실조건 확인(현재 PC). **재사용 경로(2번째 PC) 미검증** — 2026-06-15 저녁 예정.
- [x] **8. UX 다듬기 (0.4.0)** — 첫 주석 작성 시 도구막대 펼침+정리 탭 자동 표시(1회), 도구막대 ⠿ 손잡이 하나로 도구막대+패널 함께 이동(패널 자체 핸들 제거, 접힘 중에도 동행), 패널 가로폭=도구막대 폭(좌·우변 정렬), 전체삭제(🗑)를 hover 미니툴바 → 정리 탭 헤더로 이동, 주석 정리 패널에서 항목별 ✕ 개별 삭제. 단축키 재편: 백틱=도구막대 접기/펼치기(처음 펼칠 때만 형광펜 ON), Alt+1~4(형광펜·네모·정리·Notion), AI 요약 단축키(구 Alt+5) 제거.
  - 검증: 실조건 확인(현재 PC) — 자동펼침·동행 이동·폭 맞춤·삭제 UX·단축키 동작.

## 게이트웨이 메모 (2026-06-13 실측)

- 베이스: `https://factchat-cloud.mindlogic.ai/v1/gateway`
- `/chat/completions` OpenAI 호환. 비전: `image_url` data URI 입력 → `gemini-2.5-flash`, `gpt-5-mini` 정상
- 키: `~/.claude/.secrets/jbnu-gateway.key` (확장에선 옵션 페이지로 별도 입력)

## Notion 연동 메모 (2026-06-14 실측)

- API 호출은 전부 background worker 에서 (`api.notion.com` host_permissions 추가) → CORS 우회. Notion API 는 CORS 헤더 미제공이라 콘텐츠 스크립트 직접 호출 불가.
- 헤더: `Notion-Version: 2026-03-11`. 인증: 옵션 페이지에 통합 토큰 + 부모 페이지(통합과 Connections 공유 필요) 입력.
- **인박스 DB**: 첫 내보내기 때 부모 페이지 아래 DB 1회 자동 생성(`POST /databases` + `initial_data_source`), 응답의 `data_sources[0].id` 를 저장·재사용. 이후 저장은 행 생성(`parent.data_source_id` — 2025-09-03+ 부터 행 부모는 database_id 가 아니라 data_source_id). 속성: 제목·URL·저장일·분류(기본 미분류)·하이라이트·네모·요약포함. 본문은 주석을 위치순 인터리브 + AI요약(선택)만 두고, URL·네모수는 속성에만(중복 제거).
- **DB 확보·다중 PC 연결 (0.3.1)**: 로컬 캐시(`notion_data_source_id`+`notion_db_parent`) 우선 → 없으면 부모 페이지의 `child_database` 블록 중 제목 `Reading Highlighter 인박스` 매칭으로 탐색해 **0개=생성 / 1개=재사용+캐시 / 2개+=옵션 페이지에서 선택**(`notion-connect`/`notion-pick-db`). 덕분에 다른 PC도 같은 부모 페이지 ID 면 같은 DB 에 연결(로컬 캐시 비의존). 부모 페이지가 바뀌면 그 페이지 기준으로 다시 탐색.
- 부모 페이지 ID 는 URL 맨 끝 32자리 hex(끝에서부터 추출) — 슬러그의 날짜 등 hex-유사 숫자가 ID 앞에 붙는 함정 주의. `?v=뷰ID` 쿼리도 먼저 제거.
- 이미지: File Upload API 3단계(`POST /file_uploads` → `/send` 멀티파트 → image 블록의 `file_upload.id`). 페이지 children 은 요청당 100개 제한 → 초과분 PATCH append.
- **클립보드 제약**: 붙여넣기(Ctrl+V)는 수동적이라 업로드를 못 일으킨다. Notion·한글은 클립보드 HTML 의 data-URI 이미지를 버림(Word만 받음). → 이미지를 두 앱에 넣으려면 실제 PNG(image/png) 클립보드(네모의 🖼 버튼, 1장씩) 또는 Notion API 업로드(📝 버튼)뿐.
