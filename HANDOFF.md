# HANDOFF — 작업 인계 노트

> 다른 PC에서 이어서 작업할 때 전후사정을 파악하기 위한 메모. (Claude는 세션 간 대화를 기억하지 못하므로 이 파일로 맥락을 넘긴다.)

## 최종 업데이트: 2026-06-21 (0.12.0 Notion DB 한글화 + 타입 시그니처 발견(이름 자유) + Status 타입 — 아래 ★ 먼저 읽을 것)

## ★ 진행 중 / 다음 작업 (새 세션은 여기부터)

### (NEW) 0.12.0 — Notion DB 한글화 + 타입 시그니처 발견(이름 자유) + Status 타입 (`worker.js`·`manifest.json`)

> 0.11.0의 영어 컬럼·Status(select)를 사용자 피드백으로 재정비. 핵심: **DB 발견을 '제목+다중선택 타입'으로** 바꿔 DB 이름 자유화(Part A 완료) + 상태는 노션 진짜 **Status 타입** 사용. (이번 배치는 `worker.js`만.)

**A) Part A 완료 — 타입 시그니처 발견 (`worker.js` `notionSearchInboxDataSources`)**
- 제목 접두(`Reading Highlighter 인박스`) 강제 제거 → **`POST /search` query 생략(전체 data_source 열거) + '제목(title) 타입 + 다중선택(multi_select) 타입' 보유**로 후보 판별. 검색 결과에 properties 스키마 포함됨(공식 문서 WebFetch 확인 2026-06-21). → **DB 이름 완전 자유.**
- 타입 기반이라 사용자 모델("제목+다중선택만 맞으면 발견")이 그대로 성립. 시그니처로 먼저 거른 뒤 조상 페이지 한정(비용 큰 조상조회 축소). `NOTION_INBOX_TITLE`은 이제 새 DB 기본 이름일 뿐(발견에 무관).

**B) 컬럼 한글화 + 적응형=타입 우선 (`worker.js`)**
- 0.11.0 영어 컬럼을 한글로 되돌림(노션 기본 언어): `제목·분류·등급·네모·하이라이트·요약포함·URL·저장일`. 패널 UI는 그대로 한글.
- 적응형 쓰기: **제목·분류는 '타입'으로 매칭**(이름 무관 — 제목=title, 분류=다중선택 1개), 나머지 메타는 이름+타입. → 컬럼 이름이 뭐든 제목·분류는 저장됨. 분류 후보 조회(`notionGetCategories`)도 다중선택 타입을 이름 무관하게 읽음.

**C) 상태 = Notion 'Status(상태)' 타입 (`worker.js` `notionCreateInboxDatabase`)**
- 이유: Select를 '상태'라 부르니 Notion 고유 'Status 타입'과 헷갈리고, 매번 Select 이름을 '상태'로 맞춰야 했음(특히 노션에서 직접 만든 DB). → 진짜 Status 타입.
- 확장은 status **값을 안 씀** — Status 타입은 새 행에 자동 기본값을 채워 빈칸/정렬 문제가 없음(이게 원래 'In Progress 자동'의 목적이었음). status는 적응형 `want`에서 제거됨.
- 자동 생성 DB엔 **DB 생성 후 best-effort PATCH**로 status 추가(`상태:{status:{}}`). status 생성이 API 버전 의존적이라 **생성과 분리**(실패해도 DB 안 깨지고 `console.warn`만). 기본 옵션은 영문(Not started/In progress/Done) → 사용자가 노션에서 한글 rename + `삭제` 추가.
- 검증: 새 DB 한글 컬럼·이름 바꾼 DB 발견·다중선택 이름 무관·status 자동 추가/자동 기본값 = **사용자 실조건 확인(2026-06-21, "잘됨")**.

**한계/메모**
- status 옵션은 그룹과 묶여 API로 커스텀 한글 옵션을 깔끔히 못 넣음(공식 문서도 그룹 구성은 UI 권장) → 옵션명은 UI에서 rename. (자동 한글화 best-effort 2차 PATCH는 가성비 낮아 보류.)
- 다중선택이 2개 이상인 DB면 분류는 **첫 번째** 다중선택에 들어감.
- Grade(등급, select A/B/C)는 자동값 없음(수동) — 자동 생성 스키마엔 있음.

### 0.11.0 — Notion 스키마 영어화 + 다중분류 + Status/Grade + 적응형 쓰기 (`worker.js`·`content.js`·`manifest.json`)

> 노션 DB를 수동 관리(아카이브/삭제·등급)하기 좋게 스키마를 정비 + 웹스토어 배포 대비 컬럼명 영어화. 핵심은 **적응형 쓰기** — 어떤 DB든 400 없이 저장.

**A) 분류 → Tags (multi_select) (`worker.js`·`content.js`)**
- 단일 select였던 분류를 **다중선택**으로(한 항목에 여러 분류). 패널 칩 **토글식**(여러 개 켜고 끄기), 라벨 "분류 선택 (여러 개 선택 가능)".
- **직접입력 Enter로 새 칩 추가**: 전역 `swallowTypingKeys`(window 캡처 단계)가 우리 입력칸 keydown을 `stopImmediatePropagation`으로 먼저 삼켜 입력칸 자체 핸들러가 안 먹던 문제 → 노트 입력칸과 똑같이 그 함수 *안에서* 처리하도록 모듈 변수 `catComposer`/`catComposerSubmit` 등록(IME 한글은 `isComposing`으로 Enter 2회). → **사용자 실조건 확인.**

**B) 컬럼 전체 영어화 + Status + Grade (`worker.js`)**
- 스키마: `Status·Title·Tags·Grade·Boxes·Highlights·Has Summary·URL·Saved`(영어 통일). 패널 UI 텍스트는 한글 유지(컬럼명과 별개).
- **Status(select)**: 내보낼 때 자동 `In Progress`, 사용자가 Notion에서 `Delete`/`Archive`로 바꿔 수동 관리(빈칸이 정렬 맨 아래로 가던 문제 회피). ⚠ Notion **Select 타입**이어야 함 — 고유 'Status 타입'이면 적응형이 건너뜀(자동값 안 박힘).
- **Grade(select A/B/C)**: 복기하며 내용 질 메모용, 자동값 없음.

**C) 적응형 쓰기 — 400 원천 차단 (`worker.js` `notionRowProps`/`notionCreateRow`)**
- 행 생성 직전 대상 DB 스키마(`GET /data_sources/{id}`)를 읽어 **실재하는 속성에만** 기록. 제목은 title 타입 속성을 **이름 무관 탐색**(Title/Name/이름…)해 그 키로 씀. 없는 컬럼·타입 불일치는 건너뜀 → 빈약한 DB(title+Tags만)에도 무에러 저장(본문 블록은 스키마 무관하게 항상 저장). → **사용자 실조건 확인(풀스키마·빈약 DB 둘 다).**

**⏭ Part A: DB 이름 자유화 (→ 0.12.0에서 완료, 위 0.12.0 섹션 참조)**
- 현재 DB 발견은 제목이 `Reading Highlighter 인박스`로 시작해야만 패널 목록에 뜸(`notionSearchInboxDataSources`, `worker.js`). 사용자는 DB 이름을 자유롭게 짓고 싶어함(접두 강제가 불만).
- 합의된 방향: 제목 접두 대신 **"title + Tags(multi_select) 시그니처"**로 후보 DB를 판별(이름 무관). 적응형 쓰기가 이미 있어 어떤 DB를 골라도 400은 안 남.
- 착수 전 확인 필요: Notion 검색 API가 **페이지 밑 DB를 제목 쿼리 없이 열거 가능한지**, **검색 결과에 스키마(properties)가 포함되는지**(아니면 DB당 `GET /data_sources/{id}` 1회). 부하는 "부모 페이지 밑 + 목록 열 때만"이라 제한적.

### 0.10.0 — 캡처 피드백 + 크로스플랫폼 단축키 + Notion 1-DB 스킵 + 미니패널 고아 수정 (`content.js`·`content.css`·`manifest.json`)

**A) 영상 네모 미니패널 고아 수정 (`content.js`)**
- 증상: 영상 위에 네모를 그리면 hover 미니툴바(`[🤖][🖼][✕]`)만 남고 앵커(박스)는 사라져 떠 있던 문제.
- 원인: 영상 캡처는 임시 `.ca-rect` 박스를 캡처 후 제거(`commitRectCapture`의 `boxEl.remove()`)하는데, 그 박스가 잠깐 떠 있는 동안 마우스가 지나가면 문서 `mouseover` 핸들러가 `.ca-rect`에 걸려 미니툴바를 그 박스에 띄움 → 박스 제거 후 툴바만 고아로 남음.
- 수정: hover 미니툴바 셀렉터를 `.ca-rect` → **`.ca-rect[data-ca-id]`** 로 좁힘. 영상 임시 박스는 caId 없음(비영상만 `dataset.caId` 설정), 미니툴바는 어차피 caId로 주석을 찾으므로 무의미한 대상 제외. → **사용자 실조건 확인("잘됨")**.

**B) 영상 캡처 피드백 — 셔터 플래시 + 토스트 (`content.js`·`content.css`)**
- 패널을 최소화하고 F4(단축키)만 쓰면 캡처가 됐는지 확인이 어려웠음 → 시각 피드백 추가.
- **셔터 플래시**(`.ca-shutter`): 캡처한 영역에 흰 빛이 잠깐 번쩍(카메라 '찰칵'). **스크린샷이 끝난 뒤**(`captureRegion` 성공 콜백)에 발화 — 트리거 시점에 띄우면 흰빛이 캡처 이미지에 박혀 뿌예지던 문제 때문(중요). 좌표는 페이지좌표 box 기준.
- **토스트**(`.ca-toast`): 캡처 성공 시 상단 중앙에 `📷 캡처됨` 1.6초, 실패 시 빨강 `캡처 실패`. 위치는 상단(top:64px, 모드 배지·툴바와 안 겹침). → **사용자 실조건 확인("잘됨")**.

**C) 크로스플랫폼 단축키 (윈도우/맥) (`content.js`)**
- `IS_MAC` 감지(`navigator.platform`/`userAgent`). 숫자 단축키를 `e.key`→**`e.code`(`Digit1~4`)** 로 매칭 — 맥에서 Option+숫자가 특수문자(¡™£¢)로 바뀌어 `e.key`가 안 맞아 단축키가 죽던 문제 해결. `e.code`는 물리 키라 OS·레이아웃 무관, `preventDefault`로 특수문자 입력도 차단.
- **영상 캡처**: 윈도우 `F4`(유지) / 맥 `Option+백틱`(`e.code "Backquote"`). **윈도우엔 Alt+백틱을 안 묶음** — 사용자가 PowerToys always-on-top에 그 키를 써서 충돌 회피. F4 핸들러는 양쪽 유지(맥에선 OS가 가로채 잘 안 와 보조).
- 버튼 툴팁 라벨 OS별 표기(`modLabel`: `Alt+N`/`⌥N`, `capLabel`: `F4`/`⌥\``).
- **검증 상태**: 윈도우=문법+로직 프록시검증(`e.code`는 윈도우에서 기존 동작과 동일). **맥=미검증(실기 없음)** — `⌥1~4`·`⌥백틱` 실동작은 사용자 맥 확인 필요. 데드키(맥 US 자판 Option+백틱=그레이브 악센트)지만 `e.code`+`preventDefault`로 작동 예상.
- 주의: `e.code "Digit1"`은 상단 숫자열만 — 넘패드(`Numpad1`)는 제외(윈도우 Alt코드 충돌 회피 측면에선 오히려 안전). 또한 맥에서 Option+숫자/Option+백틱은 ™£¢·악센트 입력 조합이라 확장 활성 중엔 페이지 입력칸에서 그 글자가 가려짐(기존 `typing && !altKey`라 Alt/Option 조합은 타이핑 중에도 발동). 거슬리면 맥 한정 '입력칸 포커스 중 미발동' 가드 추가 검토 여지.

**D) Notion 내보내기 — DB 1개면 선택단계 스킵 (`content.js`)**
- `renderNotionDbStep`: DB가 **정확히 1개**면 선택 화면을 건너뛰고 곧장 분류·저장 화면(`showNotionPicker`)으로 → `Notion에 저장` 버튼 즉시 노출. 백엔드는 이미 단일 DB 자동 사용(`notionGetOrCreateDatabase`, `worker.js`)이라 추가 작업 없음. 0개=선택화면(생성 필요), 2개+=선택화면.
- 스킵하면 `+ 새 DB` 입구가 사라지는 함정 방지로, 분류 화면 상단에 **`‹ DB 변경·추가` 링크**(`showNotionDbStep(..., force=true)` — 1개여도 선택화면 강제 표시, 무한루프 방지 + 새 DB 생성 경로 유지). 시그니처: `showNotionDbStep`/`renderNotionDbStep`에 `force`, `renderNotionPicker`에 `parentId` 추가.
- 링크 디자인: 회색 `#666` medium(500) + 화살표 `‹`(17px/600) `inline-flex align-items:center`로 세로 중앙정렬 + hover 밑줄(인라인 `!important` 구조라 JS `setProperty(...,'important')` 토글) + 아래 구분선. → **사용자 실조건 확인("잘됨")**.

### 0.9.0 — AI 제공자 선택 + 정리 패널 AI·복사 입구 + 미니 아이콘 통일

**A) AI 제공자 선택 (게이트웨이 ↔ 무료 Gemini) (`worker.js`·`options.html/js`·`content.js`·`manifest.json`)**
- 옵션에 **제공자 드롭다운**(기관 게이트웨이 / Google Gemini). 둘 다 OpenAI 호환이라 워커 `aiConfig()`가 base URL·키만 분기 — 게이트웨이=`factchat-cloud.mindlogic.ai/v1/gateway`, Gemini=`generativelanguage.googleapis.com/v1beta/openai`. chat·models·비전(image_url+base64) 전부 동일 형식(공식 문서 확인).
- **키·모델 제공자별 저장**(`gw_key`/`gemini_key`, `gw_model`/`gemini_model`) + 활성 포인터 `ai_provider`. 전환해도 서로 안 지워짐. 옵션 키 입력은 **적응형 1칸**(전환 시 그 제공자 값 로드). Gemini `/models` id의 `models/` 접두는 `stripModelsPrefix`로 제거.
- **모델 새로고침 ↻ 버튼** 추가 — 기존엔 옵션 열 때/저장 시에만 목록 갱신됐는데, 옵션 다시 안 열고 즉시 갱신(+제공자 전환 시 유용). content.js는 `getActiveModel()`로 활성 제공자 모델 사용(질문·요약 2곳). 비전은 양쪽 다 있는 `gemini-2.5-flash` 고정.
- **검증 상태**: 4파일 문법·전 흐름 로직·Gemini 엔드포인트(문서) 확인. **실제 Gemini 키 호출은 미확인** — 사용자 실조건 확인 필요(저장·연결테스트·질문·게이트웨이 복원). 주의: Gemini `/models`는 채팅 외 모델(임베딩 등)도 섞여 옴.

**B) 정리 패널에 AI·복사 입구 (`content.js`·`content.css`)**
- **영상 캡처는 캡처 후 박스를 지워서**(시청 방해 방지) hover 미니툴바(🤖·복사)를 띄울 대상이 없었음 → 정리 패널 각 항목에 🤖(질문)·복사(🖼 이미지/📋 텍스트) 버튼 추가. **영상캡처·오프스크린 네모·노트**까지 AI·복사 가능해짐. hover 미니툴바는 그대로 유지(공유 함수 `askAnnotation`/`copyAnnotationText`/`copyAnnotationImage`로 양쪽이 같은 로직).
- 노트는 hover 대상이 없어 원래 AI 불가였는데 이번에 가능. 빈 노트 가드는 `askAnnotation`에서. 노트 편집은 재렌더가 없어 🤖는 노트에 항상 노출.

**C) 미니 아이콘 통일 (`content.css`)**
- 패널 버튼(🤖·복사·✕·노트 ▲▼)을 hover 툴바와 같은 **진한 원형+그림자**로 통일. 흰 반투명이라 복사 아이콘(📋/🖼)이 안 읽히던 문제 해결(대비 확보). 위치·크기 동일, 외형만. 버튼 가로배치 `✕(6)·복사(28)·🤖(50)·노트▲▼(72)` + 텍스트 우측 패딩 보정.

**D) 식별 표현 제거 (웹스토어 대비)**
- "전북대"·"학교" → "기관"(중의적). `src`·`manifest`·`PLAN.md` 클린. 벤더명 mindlogic·게이트웨이 URL은 학교 무관이라 유지. `memory/`(로컬·비추적)는 그대로.

### (0.8.2) — 툴바(action) 아이콘 추가 (`manifest.json`·`icons/`)

그동안 아이콘 미지정이라 크롬이 이름 첫 글자 "R" 회색 타일을 자동 생성 → 색 있는 다른 확장들 사이에서 안 띔. 전용 아이콘을 만들어 연결.

- **디자인 A**: **코랄(#ff7f50) 둥근네모 채움 + 흰 형광펜 사선** 한 줄. 채움색이라 회색 툴바에서 잘 띄고 앱 코랄 테마와 일치. (대안으로 만들었던 "빨강 네모 테두리" B안은 보류.)
- **에셋**: `icons/icon{16,32,48,128}.png` — PowerShell `System.Drawing`으로 생성(viewBox 128 기준 둥근네모 rx30 + 흰 선 (34,92)→(96,36) 두께24 round-cap). 재생성 스크립트는 대화 기록 참고(레포에 미보관).
- **연결**: `manifest.json`에 `icons`(확장 관리/스토어용) + `action.default_icon`(툴바 버튼용) 둘 다 등록.
- **검증 상태**: PNG 렌더는 육안 확인. **실제 크롬 툴바 표시는 사용자가 확장 새로고침 후 확인 필요**(미확인).

### 0.8.1 — 영상 전체 캡처 F4 단축키 (`content.js`)

0.8.0의 📷 버튼(영상 전체 1장 캡처)을 키보드로도 발동. 버튼은 호버해야 떠서 매번 마우스가 필요했는데, F4는 호버 없이 셔터처럼 누르면 됨.

- **F4 = 영상 전체 캡처**: 무모디파이어 키 핸들러(`keydown`, 백틱·Esc와 같은 분기)에 `F4` 추가. 네모 모드 아니어도 동작(단축키 편의 목적). 타이핑 중(`typing && !altKey`)엔 자동 무시.
- **대상 선택(`pickVideoForShortcut`)**: 마우스 밑 영상(`videoUnderPoint(lastMouse)`) 우선 → 없으면 **뷰포트와 겹치는 면적이 가장 큰 영상**. 화면에 영상 없으면 무동작(에러 없음). `lastMouse`는 mousemove에서 갱신.
- **`triggerVideoCapture(videoEl)`**: 인자로 영상을 받게 변경 — 📷 버튼은 인자 없이(기존대로 `magnetVideo`), F4는 선택된 영상을 직접 전달. 캡처 본체(`commitRectCapture` 경로)는 공용 그대로.
- F4 자체는 크롬 페이지 본문에서 기본 기능 없고 유튜브 단축키와도 안 겹침. 입력칸 키 격리(`swallowTypingKeys`)는 우리 편집칸 포커스 때만 작동 → 페이지 본문 F4는 안 막음.
- **검증 상태**: **사용자 실조건 확인(2026-06-19, "다 잘되네")**. 단 일부 사이트가 F4를 가로채는 경우는 그 사이트에서 개별 확인 필요.

### 0.8.0 — 영상 캡처 버튼 + 클릭=재생/정지 복원 (`content.js`·`content.css`)

0.7.0의 "영상 본문 클릭=전체 캡처"가 **본문을 무심코 클릭할 때 캡처가 오발동**해, 클릭은 예전(0.6.x)처럼 재생/정지로 되돌리고 캡처는 별도 버튼으로 분리.

- **영상 본문 단순 클릭 = 재생/정지 토글 + `video.focus({preventScroll})`**(방향키 탐색 유지). mouseup의 tiny-box 분기에서 처리(기존 `commitRectCapture(fullBox)` 제거). 드래그=부분 캡처는 그대로.
- **📷 캡처 버튼**(`.ca-capbtn`): 네모 모드에서 영상에 호버하면 영상 **우상단 모서리**에 뜸. **클릭=영상 전체 1장 캡처**(`triggerVideoCapture`→`commitRectCapture`). 아이콘 전용 40×40, 호버 시 **📷→📸·`scale(1.12)`·흰 글로우 링**(명확한 호버 피드백). 호스트 사이트(유튜브) `button` 색 누수 방지로 `color`/`background` 인라인 `!important`.
- **버튼 이동**: 버튼 자체를 드래그(>5px)하면 위치 이동, 오프셋(`{dx,dy}`, 영상 우상단 기준)을 `storage.local`(`ca_capbtn_offset`)에 저장 → 새로고침·동일 크롬계정 PC 간 유지. 클릭(이동 없음)=캡처, 드래그=이동으로 임계값 구분. 드래그 중엔 `captureBtnDragging` 플래그로 `updateMagnet`이 버튼을 숨기지 않게.
- **점선(`.ca-magnet`)은 버튼 호버 시에만**: 영상 호버=📷 버튼만 노출, 그 **버튼에 마우스를 올리면 비로소** 영상 전체 점선이 떠 "이 영역이 캡처됨"을 미리 보여줌(직관성). `updateMagnet` 재구성: 점선 표시/제거를 `showMagnetOutline`/`removeMagnetOutline`로 분리, `isUI`에 `captureBtn` 포함.
- **캡처 시 오버레이 안 찍힘**: `captureRegion`이 캡처 직전 자석·버튼을 `visibility:hidden`(`setCaptureOverlaysHidden`)으로 숨기고 **2프레임(`requestAnimationFrame`×2) 리페인트 대기 후** `captureVisibleTab` 요청, 완료/실패 시 복원. (`captureVisibleTab`은 실제 스크린샷이라 보이면 박힘 — 빨간 박스 `.ca-rect`는 기존대로 테두리만 crop.)
- **검증 상태**: 클릭=재생/정지·📷 버튼 캡처·드래그 이동·위치 유지·캡처 시 오버레이 숨김 = **사용자 실조건 확인(2026-06-19, "잘됨")**. "점선=버튼 호버 시에만 + 아이콘 전용(캡처 글자 제거)"은 **방금 변경 — 미검증**(다음 세션/사용자 육안 확인 권장). 리페인트 타이밍 레이스는 육안 확인 항목.

### 0.7.0 — 영상 자석 캡처 + Notion DB 선택/검색 재작성 (사용자 실조건 확인)  ⚠ **영상 클릭 동작은 0.8.0에서 변경됨**

**A) 영상 위 자석 캡처 (`content.js`·`content.css`)**
- 네모 모드에서 영상에 마우스를 올리면(드래그 X) 영상 전체 사각형에 **빨강 점선 자석 강조**(`.ca-magnet`, `pointer-events:none`, 채움 없음 — 시청 방해 최소화). `updateMagnet`/`hideMagnet`, mousemove에서 갱신, 드래그 시작·모드 이탈 시 제거.
- **영상 본문 단순 클릭 = 영상 전체 1장 캡처**(영상 전체 box를 만들어 기존 캡처 경로로). 드래그 = 기존처럼 부분 캡처.
- ⚠ **동작 변경**: 이전 (1)·(2)의 "영상 본문 클릭 → 재생/정지 토글 + `video.focus()`"는 **제거**됨(클릭을 캡처에 할당). 재생/정지는 **스페이스바·유튜브 재생바**로. (보류된 [제안]: 캡처 후 `video.focus()` 복원하면 방향키 탐색 유지 — 미적용.)
- 캡처 경로 추출: 기존 mouseup의 캡처 분기를 `commitRectCapture(box, boxEl)`로 빼내 드래그·클릭 양쪽이 공용.
- 자석은 재생바(컨트롤) 위에도 뜨지만 그 위 클릭은 캡처가 아니라 seek(`overControlAtDown` 통과) — 사용자 "불편하지 않음"으로 현 상태 유지.

**B) Notion DB 선택/검색 재작성 (`worker.js`·`content.js`) — 1-old(0.3.1) 접근법 대체**
- **근본 버그**: 0.3.1의 "부모 페이지 직속 `child_database` 스캔(제목 매칭)"은 **열(column)·토글 안에 중첩된 원본 DB를 못 봐서** 매번 페이지 최상위에 새 DB를 만들었음(사용자 대시보드: 원본이 좌측 열 안에 중첩 → 바닥에 중복 생성). 사진+코드로 확정.
- **교체**: ① 탐색을 **Notion Search API**로(`notionSearchInboxDataSources`, `POST /search` `filter:{property:"object",value:"data_source"}` — 2026-03-11은 database가 아니라 **data_source** 반환, 그 id가 곧 행 부모 `data_source_id`). 중첩과 무관하게 찾음. 결과는 조상 페이지(`notionAncestorPageId` — data_source→database→block→page 추적, 최대 6홉)로 부모 한정(못 풀면 관대 포함). ② **활성 DB 포인터를 `storage.sync`에 저장**(`notionGetActive`/`notionSetActive` — `notion_active_ds_id`/`_db_id`/`_parent`) → 같은 크롬 계정 PC 간 공유. ③ **내보내기 패널에 DB 선택 단계**: `내보내기 → [DB 선택 / + 새 DB(선택적 라벨)] → [분류] → 저장`(`showNotionDbStep`/`renderNotionDbStep`, 메시지 `notion-list-dbs`/`notion-create-db`/`notion-set-active-db`). 활성 DB 미리 선택돼 평소엔 그냥 통과.
- **제거된 함수**(검색이 ds id 직접 제공): `notionListChildDatabases`·`notionFindInboxDatabases`·`notionDataSourceIdOf`. `notionGetOrCreateDatabase`는 활성포인터→로컬캐시→검색 순. `notionConnect`/`notionPickDatabase`도 검색+활성포인터 기반.
- 새 DB 제목 = `"Reading Highlighter 인박스"` + 선택적 `" — 라벨"`(접두 유지 → 검색·스키마 호환). 목록은 접두 일치 data_source만 표시.
- **검증**: DB 목록에 원본+중복 노출·원본 선택 후 내보내기 = **사용자 실조건 확인(2026-06-19)**. PC 간 sync 전파는 크롬 '동기화 사용' ON 필요(2번째 PC는 추후 확인). 폴백 모서리: `notion-list-dbs` 실패 시 분류 단계로 폴백하나 검색 2건이면 "모호" 에러로 막힐 수 있음(정상 경로에선 무관).

### (1) 0.6.1 — `content.js`·`content.css` (커밋됨, 푸쉬됨)
사용자 확인 완료 후 커밋. 내용:
- **영상 위 단순 클릭 → 재생/정지 토글 + 우리 입력칸 포커스 해제**(`videoUnder` 사용). 네모 모드 mousedown에서 입력칸 blur(스페이스가 영상으로 가게). 드래그(캡처)와 클릭 구분: tiny-box(클릭)만 토글.
- **새 캡처 시 패널 자동 스크롤**(`scrollPanelTo`): 방금 추가 항목의 캡션칸이 보이게. `scrollIntoView` 대신 panelBody.scrollTop 직접(페이지 점프 방지), 이미지 로드 후 1회 재스크롤(data URL 디코드 전 높이 0 보정).
- **스크롤 체이닝 방지**: `.ca-panel-body`·`.ca-note-composer`에 `overscroll-behavior: contain`(끝까지 스크롤해도 페이지 안 밀림).
- 사용자 확인: 스크롤·클릭후스페이스·체이닝 모두 OK. 매니페스트 0.6.1.

### (2) 네모 모드 유튜브 컨트롤 클릭 — **방법 B 하이브리드 구현·실조건 검증 완료 (0.6.3)**

**현 상태(0.6.3 — `content.js`):** 방법 A를 **방법 B 하이브리드로 교체 완료**. 0.6.2의 미세 깜빡임 결함 **해소**. 사용자 실유튜브 테스트 6항목 **모두 OK**(seek·버튼·본문클릭토글·클릭후스페이스·본문드래그캡처(깜빡임0)·기사캡처). 특히 **하단 자막 구간 드래그 캡처도 깜빡임 없이 동작 확인**.

**방법 B 동작(구현됨):**
- **영상 본문(play-surface) press를 캡처 단계에서 차단** → 유튜브가 재생을 시작할 일이 없어 드래그 캡처 시 **깜빡임 0**.
- **컨트롤(재생바·버튼)만 네이티브로 통과** → seek·버튼 유지. 구분: `swallowPointer`의 pointerdown에서 `videoUnderPoint`로 영상 위인지 본 뒤 `e.target.closest(VIDEO_CONTROL_SEL)` 매칭이면 컨트롤(통과), 아니면 본문(차단).
- `VIDEO_CONTROL_SEL`(content.js 내 상수): `.ytp-chrome-bottom, .ytp-chrome-top, .ytp-chrome-controls, .ytp-progress-bar-container, .ytp-progress-bar, .ytp-gradient-bottom, .ytp-gradient-top, button, a, [role='slider'], [role='button'], input[type='range']`.
- 본문 단순 클릭 → **우리가 직접 play/pause 토글 + `video.focus()`**(스페이스는 mousedown의 입력칸 blur로 영상에 전달). 본문 드래그 → 캡처.
- 상태 변수: `overControlAtDown`(컨트롤서 시작=통과), `videoBodyAtDown`(본문 클릭 토글 대상). 방법 A의 `overVideoAtDown`/`pausedAtDown`/`dragConfirmed`/`DRAG_THRESHOLD`/`restorePlayback` **전부 제거**.

**알려진 한계/유지보수 포인트(셀렉터 의존):**
- **유튜브 DOM 클래스 의존** — 유튜브가 클래스명 바꾸면 `VIDEO_CONTROL_SEL` 보수 필요(seek·버튼·커서 모두 이 셀렉터에 묶임).
- 컨트롤바 위 캡처는 불가(통과되므로, 보통 불필요). 비유튜브 네이티브 컨트롤 영상은 컨트롤이 셀렉터에 안 잡혀 본문 취급될 수 있음(seek 대신 캡처/토글).
- self-review에서 "셀렉터가 넓어 하단 그라디언트 구간 캡처가 깨질 수 있다"는 우려 제기됐으나, **실테스트 결과 하단 자막 드래그 캡처 정상** → 현 넓은 셀렉터 유지. 추후 캡처 실패 보고 시 컨테이너/그라디언트(`.ytp-chrome-bottom`·`.ytp-gradient-*`) 빼고 인터랙티브 요소만 남기는 narrowing 옵션 있음.

### (3) 형광펜 추가 시 패널 자동 스크롤 (0.6.3) — `content.js`
네모는 새 캡처 시 `scrollPanelTo`로 패널이 해당 항목으로 스크롤됐지만 형광펜은 누락돼 있었음 → `highlightSelection`이 마지막으로 감싼 형광펜 id로 `scrollPanelTo` 호출하도록 추가. `wrapTextNode`가 감싼 id를 반환하게 바꿔 마지막 항목 추적. 여러 줄 선택 시 선택 끝 항목으로 스크롤. 사용자 실조건 확인 OK.

### (4) 형광펜 패널 복원 시 미갱신 버그 (0.6.4) — `content.js`
형광펜으로 주석 정리 패널이 열린 뒤 **도구막대 접기(백틱·▾)나 확장 아이콘으로 패널을 숨긴** 상태에서 형광펜을 추가하면, 다시 펼쳐도 그 주석이 반영 안 되던 버그. 원인: 패널을 다시 보이게 하는 경로 중 `showAnnotationsPanel`(📋 토글)만 `renderAnnotationsBody`를 다시 부르고, `toggleBar` 펼침 복원(content.js:613~)과 확장 숨김 해제(content.js:706~)는 `panel.style.display="flex"`만 하고 다시 그리지 않았음. 숨긴 동안의 형광펜은 `refreshAnnotationsPanel`이 `display==="none"` 가드로 그냥 빠져나가 누락 → 다음 형광펜을 칠해야 한꺼번에 반영됐음. 수정: 두 복원 지점에서 `refreshAnnotationsPanel()` 호출(내부 가드로 정리탭+표시 중일 때만 다시 그림, IME·캐럿 보존 그대로). **사용자 실조건 확인 OK.** 매니페스트 0.6.4.

### (5) Notion 버튼 시각 차별화 (0.6.5) — `content.css`
도구막대 4개 버튼(`🖊️ 형광펜`/`⬚ 네모`/`📋 정리·AI`/`📝 Notion`)이 전부 같은 고스트 스타일이라 '최종 저장' 액션인 Notion이 도구들과 안 구분됐음. UI 관례(주 액션=solid fill, 보조 도구=고스트)에 맞춰 **Notion 버튼(`[data-act="notion"]`)만 코랄 solid fill로 승격**: 기본 `background:#c0392b`·흰글씨·`font-weight:600`, hover `#a93226`. 나머지 3개는 그대로. 버튼 마크업·로직 무변경, CSS만. 매니페스트 0.6.5. **검증 상태: 실조건 미확인** — 형광펜/네모 active 상태(연한 코랄 `#ffe2d8` 배경+진한 코랄 글씨)와 Notion(진한 코랄 배경+흰글씨)이 나란히 있을 때 구별되는지 사용자 실확인 대기. 너무 비슷하면 Notion을 검정(`#111`) fill(B안)로 전환 옵션 있음.

### (보류) 네모 모드 컨트롤 위 커서 모양
영상 컨트롤 위에선 십자가(`.ca-rect-cursor *{cursor:crosshair!important}`) 대신 네이티브 커서가 맞으나, 구현하려면 매 mousemove마다 `VIDEO_CONTROL_SEL`로 hit-test해야 함 → 이미 brittle한 셀렉터에 커서 로직까지 결합. 순수 외형 개선이고 클릭은 정상 작동하므로 **보류**(가치 < 비용). 추후 유튜브 셀렉터 손볼 일 생기면 그때 함께.

## 0. 직전 작업: 노트·캡션·영상 캡처 (0.6.0) — 푸쉬됨(884a709)

`src/content/content.js`·`content.css`·`src/background/worker.js`. **상태: 실조건 검증 완료(2026-06-17).** 실유튜브·실노션에서 아래 항목 모두 정상 확인.

- **유튜브 드래그 격리**: 네모 모드의 pointer/mouse down·up을 `window` 캡처 단계에서 `stopImmediatePropagation` → 정지 영상이 드래그로 재생되던 버그 차단. 트레일링 click도 기존대로 무효화.
- **개인 노트(주석 사이 메모)**: 정리 패널 항목 사이/상단 `+ 노트`(hover) 인라인 삽입 + **하단 상시 입력창**(`.ca-note-composer`, panel-body 밖 형제라 재렌더에 안 지워짐, `flex-shrink:0`). Enter=끝에 추가, Shift+Enter=줄바꿈, 한글은 `isComposing` 가드로 Enter 2회(확정+제출). **▲▼로 순서 변경**. 노트 데이터모델: `{type:"note", id, text, afterId}` — afterId=가장 가까운 윗 형광펜/네모 id(없으면 null), 같은 앵커끼리는 배열 순서. `collectSorted`가 위빙.
- **이미지 캡션**: 정리 패널 이미지 아래 `.ca-cap` 편집칸 → `rect.caption`. 내보내기: 노션 이미지 블록 네이티브 `caption`(worker `notionExportBlocks`) + PDF `figcaption`.
- **입력칸 키 격리(`swallowTypingKeys`)**: 우리 편집칸(노트·캡션·입력창) 타이핑 시 키를 페이지로 안 흘림(유튜브 스페이스=재생 차단). 단 Alt/Ctrl/Meta 조합은 통과 → 입력 중에도 Alt+숫자 단축키 동작(단축키 핸들러도 `typing && !altKey`로 완화).
- **영상 인식 캡처**: 박스 중심이 `<video>` 위면(`videoUnder`) → `ann.videoTime`(=currentTime)·`videoIdx`·`videoTop` 기록, 박스는 캡처 후 제거(페이지에 안 남김). `collectSorted` 정렬키 = (y, videoTime) — 영상 캡처는 영상 문서-Y로 묶이고 시간순(같은 영상은 첫 캡처 videoTop 재사용 → 스크롤/미니플레이어에도 안 흩어짐). 패널에 `▶ mm:ss` 배지(클릭 시 `video.currentTime=t` + scrollIntoView). 내보내기 캡션 앞에 `[mm:ss]`.
- **확장 OFF(브라우저 아이콘 토글)**: `document.documentElement`에 `ca-ext-off` → CSS로 `.ca-rect` 숨김·`.ca-hl` 배경 제거(텍스트 보존). 끌 때 `applyMode(null)`로 그리기 모드·커서·테두리 해제. 단축키 핸들러는 `extHidden`이면 early-return(꺼진 상태에서 백틱이 숨겨진 도구막대 기준 0,0으로 패널을 띄워 깨지던 버그 수정).

### 배경 — 영상엔 기존 네모 모델이 부적합
기존 네모는 page-Y 정렬·박스 유지라 정적 텍스트(기사·논문)엔 맞지만, 영상은 플레이어가 한 자리 고정+시간축이라 Y정렬이 뒤죽박죽이고 박스가 시청을 방해. → 영상 위에서만 시간축 모델로 자동 전환(기사용 네모는 그대로 유지, 추가 기능).

## 1-old. 다중 PC 같은 Notion DB 연결 (0.3.1) — commit `0e1ca7b` 이후  ⚠ **SUPERSEDED by 0.7.0**

> ⚠ 이 절의 "제목으로 직속 `child_database` 탐색" 방식은 **중첩(열/토글) DB를 못 찾는 결함**이 발견돼 0.7.0에서 **Search API + storage.sync 활성 포인터 + 내보내기 패널 DB 선택**으로 대체됨(상단 ★ (NEW) 참조). 아래 기록은 히스토리로만 보존.

### 배경
- 기존: 내보내기 시 부모 페이지 아래 인박스 DB를 만들고 `data_source_id`를 **로컬 캐시**에 저장·재사용. 문제 — 다른 PC는 캐시가 없어 **같은 부모 페이지인데도 새 DB를 또 만든다.**
- 목표(approach B): 캐시가 없으면 부모 페이지에서 기존 인박스 DB를 **제목으로 탐색**해 재사용. PC 간 "같은 부모 = 같은 DB" 성립.

### 구현 (`src/background/worker.js`, `src/options/*`)
- `notionListChildDatabases` / `notionFindInboxDatabases` — 부모의 `child_database` 블록에서 제목 `Reading Highlighter 인박스` 매칭(페이지네이션 처리).
- `notionGetOrCreateDatabase`(내보내기용) 재작성: **캐시 우선 → 0개=생성 / 1개=재사용+캐시 / 2개+=에러로 옵션에서 선택 유도.**
- `notionConnect` / `notionPickDatabase` + 메시지 `notion-connect`·`notion-pick-db` — 옵션 페이지 "Notion 연결 테스트"가 DB 상태(none/single/multiple) 보고. multiple일 때만 선택 드롭다운 노출.

### 검증 상태 (중요)
- **신규생성 경로(0개→생성)**: ✅ 실조건 검증됨 — 현재 PC에서 새 페이지에 DB 연결 동작 확인.
- **재사용 경로(2번째 PC에서 같은 부모→같은 DB)**: ✅ **실조건 검증 완료(2026-06-17)** — 2번째 PC에서 같은 부모 페이지로 기존 인박스 DB 재사용(새 DB 안 생김) 확인.

### 다른 PC에서 할 테스트
1. `git pull` (코드 동기화 — 드라이브 .git 동시 동기화는 손상 위험이라 pull 권장).
2. 확장 새로고침 → 옵션에 **같은 부모 페이지 ID** 입력 → "Notion 연결 테스트".
3. 기대: **"기존 인박스 DB에 연결됨"** 표시 + 새 DB가 안 생김. 저장 시 같은 DB에 행 추가.
4. 인박스 DB가 2개 이상이면 선택 드롭다운이 떠야 함.
- 실패하면 후속 커밋으로 수정.

## 1-b. UX 다듬기 (0.4.0) — `src/content/content.js`, `content.css`
모두 현재 PC 실조건 확인 완료:
- 첫 주석 작성 시 도구막대 펼침 + 정리 탭 자동 표시(1회).
- 도구막대 ⠿ 손잡이 하나로 도구막대+패널 함께 이동(패널 핸들 제거, 접힘 중에도 동행). 드리프트 버그 수정(패널을 도구막대 실제위치+고정오프셋으로 계산).
- 패널 가로폭 = 도구막대 폭(좌·우변 정렬).
- 전체삭제(🗑)를 hover 미니툴바 → 정리 탭 헤더(빨강 버튼)로 이동. 패널 항목별 ✕ 개별 삭제 추가.
- 단축키 재편: 백틱=접기/펼치기(처음 펼칠 때만 형광펜 ON), Alt+1~4(형광펜·네모·정리·Notion), AI 요약 단축키 제거.

## 1-c. 내보내기 시 분류 선택 (0.5.0) — `src/content/content.js`, `src/background/worker.js`
현재 PC 실조건 확인 완료:
- 📝 Notion 누르면 즉시 저장 안 하고 **선택 패널** 먼저 표시: 인박스 DB의 `분류`(select) 옵션을 실시간 조회(`notion-categories` → `notionGetCategories` → `GET /data_sources/{id}` 의 `properties.분류.select.options`)해 칩 버튼으로 노출. `미분류` 항상 포함.
- **직접 입력** 칸으로 새 분류 즉석 생성(Notion API가 없는 select 옵션 자동 생성). `notionRowProps`가 `spec.category` 사용(없으면 미분류).
- AI 요약 포함 여부를 같은 패널 체크박스로 통합(기존 confirm 팝업 제거). 함수: `showNotionPicker`/`renderNotionPicker`/`sendNotionExport`.
- **버그 수정**: 패널이 Shadow DOM이 아니라 호스트 페이지 DOM이라 사이트 CSS(`button:hover/:focus` 등)가 새어들어 칩 색이 오락가락·검정으로 보였음 → 칩/입력창/버튼/라벨 인라인 스타일에 `!important`로 고정(인라인 important가 호스트 `!important`까지 이김).

## 1-d. 옵션 페이지 다크모드 (0.5.1) — `src/options/options.html`
- 옵션 페이지 CSS만 다크 팔레트로 교체(JS·구조 불변): 배경 `#1b1b1f`, 본문 글자 `#e4e4e7`, 입력/셀렉트 어두운 필드(`#2a2a2e`)+테두리(`#3a3a40`)+포커스 코랄 테두리, 보조 버튼 `#3a3a40`, 상태색 성공 `#4ade80`·오류 `#f87171`, 구분선 `#34343a`. 주 버튼 코랄(`#ff7f50`) 유지.

## 2. 다음 할 일 (대기 중)
- **0.7.0 후속(선택)**: ① 영상 클릭 캡처 후 `video.focus()` 복원(방향키 탐색) — 보류된 [제안]. ② Notion PC 간 sync 전파 2번째 PC 실확인. ③ 자석이 컨트롤바 위 표시되는 것 거슬리면 `VIDEO_CONTROL_SEL`에서 숨김.
- 0.6.0~0.6.5 항목은 실조건 검증 완료(2026-06-17~19): 정지영상 재생 안 됨 / 영상 캡처 시간순 정렬 / 박스 자동 제거 / `▶ mm:ss` 클릭 seek / 캡션 노션 사진 아래 표시 / 확장 OFF 숨김·복원·드래그 무반응 / 방법 B 영상 캡처 깜빡임 0 / 형광펜 패널 스크롤 / **영상 자석 클릭 캡처(0.7.0)** / **Notion DB 선택·검색 재사용(0.7.0)**.
- ⚠ 정정: 구 "Notion 다중 PC 같은 DB 재사용(0.3.1)"은 중첩 DB 결함으로 0.7.0에서 대체됨(위 1-old 참조). 0.3.1을 "검증 완료"로 본 기존 기록은 중첩 구조 케이스를 놓친 것.

## 3. 해결된 이슈: Alt+2(네모) 단축키
- 증상: 특정 PC에서 Alt+2만 안 먹음. **원인 = 다른 확장이 가로채기**(우리 코드 버그 아님 — 단축키는 content.js 페이지 레벨 keydown). 충돌 확장 끄니 해결.
