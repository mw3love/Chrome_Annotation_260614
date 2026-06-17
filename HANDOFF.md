# HANDOFF — 작업 인계 노트

> 다른 PC에서 이어서 작업할 때 전후사정을 파악하기 위한 메모. (Claude는 세션 간 대화를 기억하지 못하므로 이 파일로 맥락을 넘긴다.)

## 최종 업데이트: 2026-06-17 (세션 인계 — 아래 ★ 먼저 읽을 것)

## ★ 진행 중 / 다음 작업 (새 세션은 여기부터)

### (1) 0.6.1 — `content.js`·`content.css` (커밋됨, 푸쉬됨)
사용자 확인 완료 후 커밋. 내용:
- **영상 위 단순 클릭 → 재생/정지 토글 + 우리 입력칸 포커스 해제**(`videoUnder` 사용). 네모 모드 mousedown에서 입력칸 blur(스페이스가 영상으로 가게). 드래그(캡처)와 클릭 구분: tiny-box(클릭)만 토글.
- **새 캡처 시 패널 자동 스크롤**(`scrollPanelTo`): 방금 추가 항목의 캡션칸이 보이게. `scrollIntoView` 대신 panelBody.scrollTop 직접(페이지 점프 방지), 이미지 로드 후 1회 재스크롤(data URL 디코드 전 높이 0 보정).
- **스크롤 체이닝 방지**: `.ca-panel-body`·`.ca-note-composer`에 `overscroll-behavior: contain`(끝까지 스크롤해도 페이지 안 밀림).
- 사용자 확인: 스크롤·클릭후스페이스·체이닝 모두 OK. 매니페스트 0.6.1.

### (2) 네모 모드 유튜브 컨트롤 클릭 — **방법 A 구현·검증됨(0.6.2). 다음: 방법 B 하이브리드로 교체 예정(미세 깜빡임 제거)**

**현 상태(0.6.2, 커밋됨 — `content.js`):** 방법 A + 재생상태 사후복원. 사용자 실유튜브 테스트 완료: seek·버튼·드래그캡처·기사캡처·클릭후스페이스 **모두 OK**. 정지영상 드래그 재생 회귀도 `restorePlayback`으로 잡음. **남은 결함 1개**: 클릭→드래그→뗌 과정에서 **미세하게 1프레임 재생 깜빡임**(소리 틱 + 영상 미세 이동).

**왜 못 없애나(구조적 한계):** 방법 A는 클릭 통과를 위해 press(pointerdown/mousedown)를 유튜브로 흘린다 → 유튜브가 그 press로 **한 프레임 재생한 뒤** `restorePlayback`이 되돌리는 순서. 같은 이벤트를 "드래그인지 확인 후" 사후에 막을 수 없으므로(동기 전파) ≥1프레임 재생은 불가피. 복원을 당겨도 0프레임 안 됨.

**다음 세션 작업 — 방법 B 하이브리드(사용자 승인됨):**
- 핵심: **영상 본문(play-surface) press는 아예 차단**(유튜브가 재생 시작할 일 없음 → 깜빡임 0). **컨트롤(재생바·버튼)만 네이티브로 통과**시켜 seek·버튼 유지.
- 본문 vs 컨트롤 구분은 `swallowPointer`의 `e.target`으로(pointerdown 시점 실제 타깃). 컨트롤 셀렉터 예: `.ytp-chrome-bottom, .ytp-chrome-top, .ytp-progress-bar-container, .ytp-progress-bar, .ytp-gradient-bottom, .ytp-chrome-controls, button, a, [role="slider"], [role="button"]` → `e.target.closest(...)` 매칭되면 **통과**(캡처·수동토글 안 함), 아니면 **본문**으로 보고 차단.
- 본문 처리: 단순 클릭 → **우리가 직접 play/pause 토글 + `video.focus()`**(0.6.1 방식 복귀, `restorePlayback`/`pausedAtDown` 불필요해짐 → 제거). 드래그 → 기존대로 캡처(press 차단했으니 재생 안 됨, 깜빡임 0).
- 비용/리스크: **유튜브 DOM 클래스 의존**(유튜브 구조 변경 시 셀렉터 보수). 컨트롤바 위 캡처는 불가(보통 불필요). 비유튜브 네이티브 컨트롤 영상은 seek 안 될 수 있음(본문 취급). → 0프레임 + seek 동시 유지엔 본문/컨트롤 구분이 필수이고 그 구분은 셀렉터 외 방법 없음(셀렉터 없이 0프레임 = seek 포기).
- 교체 시 정리 대상: 현 A의 `overVideoAtDown` 미확정-통과 로직, `pausedAtDown`/`restorePlayback`, `DRAG_THRESHOLD` 기반 지연확정 — B에선 press를 바로 차단하므로 단순화됨. `videoUnderPoint`는 본문 판정에 재사용 가능.
- 후퇴 옵션: 방법 C(클릭 통과 포기, 깜빡임·셀렉터 의존 모두 없으나 seek 불가 — 애초 문제로 회귀).

## 0. 직전 작업: 노트·캡션·영상 캡처 (0.6.0) — 푸쉬됨(884a709)

`src/content/content.js`·`content.css`·`src/background/worker.js`. **상태: 미검증(실유튜브·실노션 확인 필요).** 헤드리스로 재현 불가한 항목이라 다른 PC/현재 PC에서 직접 확인 후 검증완료로 갱신할 것.

- **유튜브 드래그 격리**: 네모 모드의 pointer/mouse down·up을 `window` 캡처 단계에서 `stopImmediatePropagation` → 정지 영상이 드래그로 재생되던 버그 차단. 트레일링 click도 기존대로 무효화.
- **개인 노트(주석 사이 메모)**: 정리 패널 항목 사이/상단 `+ 노트`(hover) 인라인 삽입 + **하단 상시 입력창**(`.ca-note-composer`, panel-body 밖 형제라 재렌더에 안 지워짐, `flex-shrink:0`). Enter=끝에 추가, Shift+Enter=줄바꿈, 한글은 `isComposing` 가드로 Enter 2회(확정+제출). **▲▼로 순서 변경**. 노트 데이터모델: `{type:"note", id, text, afterId}` — afterId=가장 가까운 윗 형광펜/네모 id(없으면 null), 같은 앵커끼리는 배열 순서. `collectSorted`가 위빙.
- **이미지 캡션**: 정리 패널 이미지 아래 `.ca-cap` 편집칸 → `rect.caption`. 내보내기: 노션 이미지 블록 네이티브 `caption`(worker `notionExportBlocks`) + PDF `figcaption`.
- **입력칸 키 격리(`swallowTypingKeys`)**: 우리 편집칸(노트·캡션·입력창) 타이핑 시 키를 페이지로 안 흘림(유튜브 스페이스=재생 차단). 단 Alt/Ctrl/Meta 조합은 통과 → 입력 중에도 Alt+숫자 단축키 동작(단축키 핸들러도 `typing && !altKey`로 완화).
- **영상 인식 캡처**: 박스 중심이 `<video>` 위면(`videoUnder`) → `ann.videoTime`(=currentTime)·`videoIdx`·`videoTop` 기록, 박스는 캡처 후 제거(페이지에 안 남김). `collectSorted` 정렬키 = (y, videoTime) — 영상 캡처는 영상 문서-Y로 묶이고 시간순(같은 영상은 첫 캡처 videoTop 재사용 → 스크롤/미니플레이어에도 안 흩어짐). 패널에 `▶ mm:ss` 배지(클릭 시 `video.currentTime=t` + scrollIntoView). 내보내기 캡션 앞에 `[mm:ss]`.
- **확장 OFF(브라우저 아이콘 토글)**: `document.documentElement`에 `ca-ext-off` → CSS로 `.ca-rect` 숨김·`.ca-hl` 배경 제거(텍스트 보존). 끌 때 `applyMode(null)`로 그리기 모드·커서·테두리 해제. 단축키 핸들러는 `extHidden`이면 early-return(꺼진 상태에서 백틱이 숨겨진 도구막대 기준 0,0으로 패널을 띄워 깨지던 버그 수정).

### 배경 — 영상엔 기존 네모 모델이 부적합
기존 네모는 page-Y 정렬·박스 유지라 정적 텍스트(기사·논문)엔 맞지만, 영상은 플레이어가 한 자리 고정+시간축이라 Y정렬이 뒤죽박죽이고 박스가 시청을 방해. → 영상 위에서만 시간축 모델로 자동 전환(기사용 네모는 그대로 유지, 추가 기능).

## 1-old. 다중 PC 같은 Notion DB 연결 (0.3.1) — commit `0e1ca7b` 이후

### 배경
- 기존: 내보내기 시 부모 페이지 아래 인박스 DB를 만들고 `data_source_id`를 **로컬 캐시**에 저장·재사용. 문제 — 다른 PC는 캐시가 없어 **같은 부모 페이지인데도 새 DB를 또 만든다.**
- 목표(approach B): 캐시가 없으면 부모 페이지에서 기존 인박스 DB를 **제목으로 탐색**해 재사용. PC 간 "같은 부모 = 같은 DB" 성립.

### 구현 (`src/background/worker.js`, `src/options/*`)
- `notionListChildDatabases` / `notionFindInboxDatabases` — 부모의 `child_database` 블록에서 제목 `Reading Highlighter 인박스` 매칭(페이지네이션 처리).
- `notionGetOrCreateDatabase`(내보내기용) 재작성: **캐시 우선 → 0개=생성 / 1개=재사용+캐시 / 2개+=에러로 옵션에서 선택 유도.**
- `notionConnect` / `notionPickDatabase` + 메시지 `notion-connect`·`notion-pick-db` — 옵션 페이지 "Notion 연결 테스트"가 DB 상태(none/single/multiple) 보고. multiple일 때만 선택 드롭다운 노출.

### 검증 상태 (중요)
- **신규생성 경로(0개→생성)**: ✅ 실조건 검증됨 — 현재 PC에서 새 페이지에 DB 연결 동작 확인.
- **재사용 경로(2번째 PC에서 같은 부모→같은 DB)**: ⏳ **미검증.** 이게 이번 변경의 핵심.

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
- **0.6.0 실조건 검증** — 실유튜브에서: 정지영상 재생 안 됨 / 영상 캡처 시간순 정렬 / 박스 자동 제거 / `▶ mm:ss` 클릭 seek / 캡션 노션 사진 아래 표시 / 확장 OFF 시 주석 숨김·복원·드래그 무반응. 이상 시 후속 커밋으로 수정.

## 3. 해결된 이슈: Alt+2(네모) 단축키
- 증상: 특정 PC에서 Alt+2만 안 먹음. **원인 = 다른 확장이 가로채기**(우리 코드 버그 아님 — 단축키는 content.js 페이지 레벨 keydown). 충돌 확장 끄니 해결.
