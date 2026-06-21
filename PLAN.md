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
| AI 백엔드 | 게이트웨이 또는 Gemini(선택) | 둘 다 OpenAI 호환 chat+vision. 옵션에서 전환(0.9.0) |
| 모델 | 요약=Claude/GPT/Gemini, 이미지=Gemini 비전 | 제공자별 모델 목록 동적 로드 |
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
- [~] **7. 다중 PC 같은 DB 연결 (0.3.1)** ⚠ **0.7.0에서 대체** — DB 확보 시 로컬 캐시 없으면 부모 페이지에서 기존 인박스 DB(제목 매칭)를 탐색해 0개=생성/1개=재사용/2개+=옵션 페이지에서 선택. **결함**: 직속 `child_database`만 스캔 → 열/토글 안 중첩 DB를 못 찾아 중복 생성. → 12번(Search API+sync+패널 선택)으로 교체.
- [x] **8. UX 다듬기 (0.4.0)** — 첫 주석 작성 시 도구막대 펼침+정리 탭 자동 표시(1회), 도구막대 ⠿ 손잡이 하나로 도구막대+패널 함께 이동(패널 자체 핸들 제거, 접힘 중에도 동행), 패널 가로폭=도구막대 폭(좌·우변 정렬), 전체삭제(🗑)를 hover 미니툴바 → 정리 탭 헤더로 이동, 주석 정리 패널에서 항목별 ✕ 개별 삭제. 단축키 재편: 백틱=도구막대 접기/펼치기(처음 펼칠 때만 형광펜 ON), Alt+1~4(형광펜·네모·정리·Notion), AI 요약 단축키(구 Alt+5) 제거.
  - 검증: 실조건 확인(현재 PC) — 자동펼침·동행 이동·폭 맞춤·삭제 UX·단축키 동작.
- [x] **9. 내보내기 시 분류 선택 (0.5.0)** — 📝 Notion 누르면 바로 저장하지 않고, 인박스 DB의 `분류`(select) 옵션을 실시간 조회해 칩 버튼으로 보여주는 선택 패널을 먼저 띄움. 직접 입력으로 새 분류 즉석 생성(Notion이 없는 옵션 자동 생성), AI 요약 포함 여부도 같은 패널의 체크박스로 통합(구 confirm 제거). → 저장 후 Notion에서 분류 칸 누르는 수고 제거.
  - 검증: 실조건 확인(현재 PC) — 칩 조회·선택·직접입력·요약 체크 동작. 칩/입력창 스타일은 호스트 사이트 CSS 침범 막으려 인라인 `!important`로 고정.
- [~] **10. 노트·캡션·영상 캡처 (0.6.0)** — ① **유튜브 격리**: 네모 드래그 제스처를 캡처 단계 `stopImmediatePropagation`으로 페이지에서 차단(정지 영상이 재생 안 됨). ② **개인 노트**: 정리 패널 항목 사이 `+ 노트` 인라인 삽입 + **하단 상시 입력창**(Enter 추가, IME 조합은 `isComposing`으로 Enter 2회) + **▲▼ 순서 변경**(노트는 가장 가까운 윗 형광펜/네모에 앵커링). ③ **이미지 캡션**: 정리 패널 이미지 아래 캡션칸 → 노션 이미지 블록 **네이티브 `caption`** 연동(사진 아래 표시) + PDF figcaption. ④ **입력칸 키 격리**: 우리 편집칸 타이핑 시 키 이벤트를 페이지로 안 흘려 사이트 단축키(유튜브 스페이스=재생) 차단, 단 Alt/Ctrl/Meta 조합은 통과(우리 단축키 유지). ⑤ **영상 인식 캡처**: `<video>` 위 캡처면 `currentTime` 기록 → 타임스탬프 순 정렬(영상 문서-Y 1차·시간 2차 키, 같은 영상은 첫 캡처 Y 재사용), 박스 자동 제거, `▶ mm:ss` 배지 클릭 시 그 장면으로 seek, 내보내기에 `[mm:ss]`. ⑥ **확장 OFF**: 브라우저 아이콘으로 끄면 `html.ca-ext-off`로 페이지 형광펜·네모 숨김 + 그리기 모드 해제 + 단축키 무시(꺼진 상태 백틱 깨짐 수정).
  - 검증: **미검증(실유튜브·실노션 확인 필요)** — 정지영상 재생 안 됨 / 시간순 정렬 / 박스 사라짐 / seek / 캡션 노션 연동 / OFF 숨김·복원. 한계: cross-origin 임베드 iframe은 `currentTime` 접근 불가(youtube.com 직접 시청만).
- [x] **11. UX 보완 (0.6.1)** — ① 영상 위 단순 클릭 → 재생/정지 토글 + 우리 입력칸 포커스 해제(스페이스가 영상으로). ② 새 캡처 시 정리 패널이 그 항목 캡션칸까지 자동 스크롤(이미지 로드 후 재정렬, panelBody만 스크롤해 페이지 점프 방지). ③ 정리 패널·입력창 `overscroll-behavior:contain`으로 스크롤 체이닝(끝에서 페이지 밀림) 방지.
  - 검증: 스크롤·클릭후 스페이스·체이닝 실조건 확인(사용자). ⚠ ①의 "영상 클릭=재생토글"은 **0.7.0에서 "영상 클릭=전체 캡처"로 대체**(아래 12 참조).
- [x] **12. 영상 자석 캡처 + Notion DB 선택/검색 재작성 (0.7.0)** — ① **영상 자석**: 네모 모드에서 영상에 호버하면 영상 전체에 빨강 점선 자석(`.ca-magnet`) 표시, **클릭=영상 전체 1장 캡처**(드래그=부분 캡처 유지). 재생/정지는 스페이스바·재생바로(클릭 토글 제거). ② **Notion DB 선택/검색**: 직속 스캔(중첩 DB 못 봄)을 Search API(`data_source`)로 교체, 활성 DB 포인터를 `storage.sync`로 PC 간 공유, 내보내기 패널에 DB 선택/새 DB 추가 단계 추가(7번 항목의 중첩 결함 해결). Notion 메모 절 참조.
  - 검증: 자석 클릭 캡처·DB 목록/선택/내보내기 **사용자 실조건 확인(2026-06-19)**. PC 간 sync 전파는 추후 2번째 PC 확인.
  - ⚠ ①의 "영상 클릭=전체 캡처"는 **0.8.0에서 "클릭=재생/정지"로 되돌리고 캡처는 📷 버튼으로 분리**(아래 13 참조).
- [x] **13. 영상 캡처 버튼 + 클릭=재생/정지 복원 (0.8.0)** — 0.7.0의 "영상 클릭=전체 캡처"를 되돌려 **영상 본문 단순 클릭 = 재생/정지 토글(+`video.focus`로 방향키 탐색 유지)**. 영상 전체 1장 캡처는 호버 시 영상 **우상단에 뜨는 📷 캡처 버튼**으로 분리(드래그=부분 캡처는 그대로). 버튼은 드래그로 **이동 가능**하고 위치는 `storage.local`(`ca_capbtn_offset`)에 저장(새로고침·동일 크롬계정 PC 간 유지). **버튼에 호버할 때만** 영상 점선(`.ca-magnet`)이 떠 "이 영역이 캡처됨"을 미리 보여줌(영상 호버=버튼만 노출). 캡처 직전 버튼·점선을 숨기고 2프레임 리페인트 후 `captureVisibleTab` → 캡처 이미지에 오버레이 안 박힘. 버튼=아이콘 전용 40×40(호버 시 📷→📸·확대·흰 글로우 링), 호스트 사이트 CSS 누수 방지 `color`/`background` 인라인 `!important`.
  - 검증: 클릭=재생/정지·📷 버튼 캡처·드래그 이동·위치 유지·캡처 시 오버레이 숨김 = **사용자 실조건 확인(2026-06-19, "잘됨")**. "점선=버튼 호버 시에만 + 아이콘 전용(캡처 글자 제거)"은 **방금 변경 — 미검증**. 캡처 오버레이 숨김의 리페인트 타이밍은 육안 확인 권장(헤드리스 아님).
- [x] **14. AI 제공자 선택 + 패널 AI·복사 입구 + 아이콘 통일 (0.9.0)** — ① **AI 제공자 선택**: 옵션에 제공자(기관 게이트웨이 / 무료 Gemini) 드롭다운. 둘 다 OpenAI 호환이라 워커 `aiConfig()`가 base URL·키만 분기(Gemini=`generativelanguage.googleapis.com/v1beta/openai` — chat·models·비전 호환). 키·모델 제공자별 저장(`gw_key`/`gemini_key`·`gw_model`/`gemini_model`·활성포인터 `ai_provider`), **적응형 키 1칸**, **모델 새로고침 ↻ 버튼**, Gemini id `models/` 접두 정규화(`stripModelsPrefix`). content는 `getActiveModel()` 사용(비전은 `gemini-2.5-flash` 고정). ② **정리 패널 AI·복사 입구**: 영상 캡처는 박스를 지워 hover 미니툴바를 못 써서, 패널 항목에 🤖(질문)·복사(🖼/📋) 추가 → 영상캡처·오프스크린 네모·노트까지 AI·복사 가능(hover 툴바와 로직 공유). ③ **아이콘 통일**: 패널 버튼을 hover 툴바와 같은 진한 원형으로(복사 아이콘 가독성). ④ **식별 표현 제거**: "전북대/학교"→"기관"(웹스토어 대비).
  - 검증: 4파일 문법·전 흐름 로직·Gemini 엔드포인트(문서) 확인. **실제 Gemini 키 호출·실조건은 사용자 확인 필요**(저장·연결테스트·질문·게이트웨이 복원). 패널 버튼·아이콘은 리로드 후 육안 확인 권장. 주의: Gemini `/models`는 채팅 외 모델도 섞여 옴.
- [x] **15. 캡처 피드백 + 크로스플랫폼 단축키 + Notion 1-DB 스킵 + 미니패널 고아 수정 (0.10.0)** — ① **미니패널 고아 수정**: 영상 캡처 임시 박스가 제거될 때 hover 미니툴바만 떠 있던 버그 → 셀렉터를 `.ca-rect[data-ca-id]`로 좁혀 영상 임시 박스(caId 없음) 제외. ② **캡처 피드백**: 영상 캡처 성공 시 캡처 영역에 흰 셔터 플래시(`.ca-shutter`, **스크린샷 끝난 뒤** 발화해 이미지에 안 박힘) + 상단 토스트(`.ca-toast` `📷 캡처됨`/실패 `캡처 실패`) — 패널 최소화·단축키만 써도 캡처 인지. ③ **크로스플랫폼 단축키**: `IS_MAC` 감지, 숫자 단축키 `e.key`→`e.code`(`Digit1~4`)로 매칭(맥 Option+숫자 특수문자 문제 해결), 영상 캡처 = 윈도우 `F4` / 맥 `Option+백틱`(`Backquote`), 윈도우엔 Alt+백틱 미바인딩(PowerToys 충돌 회피), 툴팁 라벨 OS별(`modLabel`/`capLabel`). ④ **Notion 1-DB 스킵**: `renderNotionDbStep`이 DB 정확히 1개면 선택단계 건너뛰고 바로 분류·저장(`showNotionPicker`), 분류 화면 상단 `‹ DB 변경·추가` 링크로 되돌아가기(`force=true`, 새 DB 생성 경로 유지). 0/2+개는 기존대로 선택화면.
  - 검증: ①②④ = **사용자 실조건 확인(2026-06-21, "잘됨")**(윈도우). ③ 윈도우=문법+로직 프록시검증(`e.code`는 윈도우 기존 동작과 동일), **맥=미검증(실기 없음)** — `⌥1~4`·`⌥백틱` 사용자 맥 확인 필요. 한계: 맥에서 Option+숫자/백틱은 ™£¢·악센트 입력 조합이라 확장 활성 중 입력칸에서 가려짐(거슬리면 맥 한정 입력칸 가드 검토).

- [x] **16. Notion 스키마 영어화 + 다중분류 + Status/Grade + 적응형 쓰기 (0.11.0)** — ① **분류 → Tags(multi_select)**: 단일 select였던 분류를 다중선택으로(한 항목 여러 분류). 패널 칩 토글식("여러 개 선택 가능" 안내), 직접입력 **Enter로 새 칩 추가** — 전역 `swallowTypingKeys`가 입력칸 keydown을 먼저 삼키므로, 노트와 동일하게 그 함수 안에서 `catComposer`/`catComposerSubmit` 콜백으로 처리(IME는 `isComposing` 가드). ② **컬럼 전체 영어화**(웹스토어 대비): `Title·URL·Saved·Tags·Highlights·Boxes·Has Summary·Status`. ③ **Status(select)**: 항목 처리 상태 — 내보낼 때 자동 `In Progress`, 사용자가 Notion에서 `Delete`/`Archive`로 바꿔 관리(속성 빈칸이 정렬 맨 아래로 가던 문제 회피). ④ **Grade(select A/B/C)**: 복기하며 내용 질 메모 — 자동값 없음(빈칸). ⑤ **적응형 쓰기**: 행 생성 직전 대상 DB 스키마를 읽어 **실재하는 속성에만** 기록(`notionRowProps(spec, schemaProps)`), 제목은 title 타입 속성을 **이름 무관 탐색**해 그 키로 씀 → 없는 컬럼·타입 불일치로 인한 400 원천 차단(빈약한 DB엔 있는 것만, 본문 블록은 스키마 무관하게 항상 저장).
  - 검증: 풀스키마 새 DB 저장·다중분류·Enter 추가·빈약한 DB(title+Tags만) 무에러 = **사용자 실조건 확인(2026-06-21)**. 주의: Status는 Notion **Select 타입**이어야 자동 `In Progress`가 박힘(Notion 고유 'Status 타입'이면 `select`와 달라 적응형이 건너뜀). 컬럼 순서는 생성 시 초기값만 지정(뷰에서 드래그 필요할 수 있음).
  - ⚠ **0.12.0에서 대체/완료**: ②영어 컬럼·③Status(select)는 **한글 컬럼·Notion Status 타입**으로 바뀌고, 위 "미완(Part A)"이던 이름-자유 발견은 **타입 시그니처로 완료**됨 → 17번 참조.

- [x] **17. Notion DB 한글화 + 타입 시그니처 발견(이름 자유) + Status 타입 (0.12.0)** — 0.11.0의 영어 컬럼·Status(select)를 사용자 피드백으로 재정비. ① **컬럼 한글화**: `제목·분류·등급·네모·하이라이트·요약포함·URL·저장일`(노션 기본 언어). ② **발견 = 타입 시그니처(Part A 완료)**: `notionSearchInboxDataSources`가 제목 접두 대신 **'제목(title) 타입 + 다중선택(multi_select) 타입' 보유**로 후보 판별(`POST /search` query 생략 = 전체 data_source 열거, 결과에 properties 포함 — 공식 문서 확인). → **DB 이름 완전 자유.** ③ **적응형 쓰기 = 타입 우선**: 제목·분류는 타입으로 매칭(이름 무관), 메타(하이라이트·네모·요약포함·저장일·URL)는 이름+타입. ④ **상태 = Notion 'Status(상태)' 타입**: Select(이름 '상태')가 Notion 고유 Status 타입과 헷갈리고 매번 이름을 맞춰야 하던 문제 → 진짜 Status 타입. 확장은 status **값을 안 씀**(Status 타입은 새 행에 자동 기본값을 채워 빈칸/정렬 문제 없음 — 원래 'In Progress 자동'의 목적). 자동 생성 DB엔 **DB 생성 후 best-effort PATCH**로 status 추가(`상태:{status:{}}`, 실패해도 DB 안 깨짐 — status 생성이 API 버전 의존적이라 분리). 기본 옵션은 영문(Not started/In progress/Done)이라 사용자가 노션에서 한글 rename + `삭제` 추가.
  - 검증: 새 DB 한글 컬럼·이름 바꾼 DB 발견·다중선택 이름 무관 분류 저장·status 자동 추가/자동 기본값 = **사용자 실조건 확인(2026-06-21, "잘됨")**. 한계: status 옵션은 그룹과 묶여 API로 커스텀 한글 옵션 설정이 불안정 → UI에서 rename(공식 문서도 그룹 구성은 UI 권장). 다중선택이 2개 이상이면 분류는 첫 번째에 들어감.

## 게이트웨이 메모 (2026-06-13 실측)

- 베이스: `https://factchat-cloud.mindlogic.ai/v1/gateway`
- `/chat/completions` OpenAI 호환. 비전: `image_url` data URI 입력 → `gemini-2.5-flash`, `gpt-5-mini` 정상
- 키: 로컬 `.secrets` 파일에 보관 (확장에선 옵션 페이지로 별도 입력)
- **(0.9.0) Gemini 무료 API도 선택 가능**: 옵션 제공자 드롭다운으로 전환. Gemini OpenAI 호환 base `https://generativelanguage.googleapis.com/v1beta/openai` — `/chat/completions`·`/models`·비전(image_url+base64) 동일 형식. 키는 `gemini_key`로 따로 저장(게이트웨이 `gw_key`와 독립), 활성 제공자 = `ai_provider`. 워커 `aiConfig()`가 분기.

## Notion 연동 메모 (2026-06-14 실측)

- API 호출은 전부 background worker 에서 (`api.notion.com` host_permissions 추가) → CORS 우회. Notion API 는 CORS 헤더 미제공이라 콘텐츠 스크립트 직접 호출 불가.
- 헤더: `Notion-Version: 2026-03-11`. 인증: 옵션 페이지에 통합 토큰 + 부모 페이지(통합과 Connections 공유 필요) 입력.
- **인박스 DB**: 첫 내보내기 때 부모 페이지 아래 DB 1회 자동 생성(`POST /databases` + `initial_data_source`), 응답의 `data_sources[0].id` 를 저장·재사용. 이후 저장은 행 생성(`parent.data_source_id` — 2025-09-03+ 부터 행 부모는 database_id 가 아니라 data_source_id). 속성(0.12.0 한글): `제목`·`분류`(multi_select·여러 개)·`등급`(select A/B/C·수동)·`네모`·`하이라이트`·`요약포함`·`URL`·`저장일`. **상태**는 Notion `Status(상태)` 타입 — DB 생성 후 best-effort PATCH로 추가(`상태:{status:{}}`, 실패해도 DB 안 깨짐), 확장은 status 값은 안 씀(Status 타입 자동 기본값으로 빈칸 방지). **적응형 쓰기**(`notionRowProps(spec, schemaProps)`): 제목·분류는 타입으로 매칭(이름 무관), 메타는 이름+타입 — 실재하는 속성에만 기록해 400 회피. 본문은 주석을 위치순 인터리브 + AI요약(선택)만 두고, URL·네모 수는 속성에만(중복 제거).
- **DB 확보·선택·다중 PC 연결 (0.7.0 — 0.3.1 대체)**: 구버전은 부모의 직속 `child_database` 블록을 제목 매칭으로 스캔했으나 **열(column)·토글 안 중첩 DB를 못 찾아** 매번 새 DB가 생기던 결함 → 다음으로 교체.
  - **탐색 = Notion Search API**: `notionSearchInboxDataSources`가 `POST /search`(`filter:{property:"object",value:"data_source"}`, **query 생략 = 전체 data_source 열거**)로 후보를 찾음(2026-03-11은 database가 아니라 data_source를 반환하며 그 id가 곧 행 부모 `data_source_id`). **(0.12.0) 식별 = 타입 시그니처**: 제목 접두 대신 **'제목(title) 타입 + 다중선택(multi_select) 타입' 보유**로 판별 → DB 이름 자유(검색 결과에 properties 스키마 포함 — 공식 문서 확인). 중첩과 무관. 시그니처로 먼저 거른 뒤 조상 페이지(`notionAncestorPageId`)로 부모 한정(못 풀면 관대 포함).
  - **활성 DB 포인터 = `storage.sync`**(`notion_active_ds_id`/`_db_id`/`_parent`, `notionGetActive`/`notionSetActive`) → 같은 크롬 계정 PC 간 자동 공유(크롬 '동기화 사용' ON 시). 로컬 캐시는 폴백.
  - **내보내기 패널에서 DB 선택/추가**: `내보내기 → [DB 선택 / + 새 DB(선택적 라벨 " — …")] → [분류] → 저장`(`showNotionDbStep`, 메시지 `notion-list-dbs`/`notion-create-db`/`notion-set-active-db`). `notionGetOrCreateDatabase`는 활성포인터→로컬캐시→검색(1=재사용/0=생성/2+=패널선택) 순. 제거된 함수: `notionListChildDatabases`·`notionFindInboxDatabases`·`notionDataSourceIdOf`.
    - **(0.10.0) DB 1개면 선택단계 스킵**: `renderNotionDbStep`이 DB 정확히 1개면 선택화면을 건너뛰고 바로 분류·저장(`showNotionPicker`) — 백엔드가 단일 DB 자동 사용하므로 안전. 분류 화면 상단 `‹ DB 변경·추가` 링크가 `showNotionDbStep(..., force=true)`로 선택화면을 강제 재진입(새 DB 생성 경로 유지·무한루프 방지). 0/2+개는 기존대로 선택화면.
- 부모 페이지 ID 는 URL 맨 끝 32자리 hex(끝에서부터 추출) — 슬러그의 날짜 등 hex-유사 숫자가 ID 앞에 붙는 함정 주의. `?v=뷰ID` 쿼리도 먼저 제거.
- 이미지: File Upload API 3단계(`POST /file_uploads` → `/send` 멀티파트 → image 블록의 `file_upload.id`). 페이지 children 은 요청당 100개 제한 → 초과분 PATCH append.
- **클립보드 제약**: 붙여넣기(Ctrl+V)는 수동적이라 업로드를 못 일으킨다. Notion·한글은 클립보드 HTML 의 data-URI 이미지를 버림(Word만 받음). → 이미지를 두 앱에 넣으려면 실제 PNG(image/png) 클립보드(네모의 🖼 버튼, 1장씩) 또는 Notion API 업로드(📝 버튼)뿐.
