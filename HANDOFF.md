# HANDOFF — 작업 인계 노트

> 다른 PC에서 이어서 작업할 때 전후사정을 파악하기 위한 메모. (Claude는 세션 간 대화를 기억하지 못하므로 이 파일로 맥락을 넘긴다.)

## 최종 업데이트: 2026-06-19 (0.8.0 영상 캡처 버튼 + 클릭=재생/정지 복원 — 아래 ★ 먼저 읽을 것)

## ★ 진행 중 / 다음 작업 (새 세션은 여기부터)

### (NEW) 0.8.0 — 영상 캡처 버튼 + 클릭=재생/정지 복원 (`content.js`·`content.css`)

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
