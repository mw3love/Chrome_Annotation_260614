// Reading Highlighter — 콘텐츠 스크립트 (1단계: 주석 MVP)
// 코랄 형광펜 하이라이트 + 빨간 네모 캡처영역 + 지우개. 저장은 세션 메모리만.
(() => {
  if (window.__caInjected) return;          // 중복 주입 방지
  window.__caInjected = true;

  const HL = "ca-hl";
  let mode = null;                            // 'highlight' | 'rect' | 'erase' | null
  const annotations = [];                     // 세션 메모리 (새로고침 시 사라짐)
  window.__caAnnotations = annotations;       // 디버그용 노출

  const uid = () => "ca" + Math.random().toString(36).slice(2, 9);

  // OS 감지 — 단축키 라벨·동작을 윈도우/맥에 맞춰 분기. (Mac: Option=Alt, F4는 OS가 가로채 불안정)
  const IS_MAC =
    /Mac|iPhone|iPad/i.test(navigator.platform || "") || /Mac OS X/i.test(navigator.userAgent || "");
  const modLabel = (n) => (IS_MAC ? "⌥" + n : "Alt+" + n); // 숫자 단축키 라벨: 맥 ⌥1 / 윈도우 Alt+1
  const capLabel = IS_MAC ? "⌥` (Option+백틱)" : "F4"; // 영상 캡처 단축키 라벨

  // ---------- 도구막대 ----------
  const bar = document.createElement("div");
  bar.className = "ca-toolbar";
  // 순서: [이동⠿][버튼묶음][접기◂/▸] — 도구막대를 오른쪽 고정(right 기준)해 접기 버튼이
  // 맨 오른쪽 제자리에 고정. 접으면 왼쪽으로만 줄어들어 버튼 위치(마우스)가 안 바뀜.
  bar.innerHTML =
    '<span class="ca-grip" title="드래그해 이동">⠿</span>' +
    '<span class="ca-bar-main">' +
    '<button data-mode="highlight" title="형광펜 (단축키 ' + modLabel("1") + ')">🖊️ 형광펜</button>' +
    '<button data-mode="rect" title="네모 캡처 영역 (단축키 ' + modLabel("2") + ')">⬚ 네모</button>' +
    '<span class="ca-sep"></span>' +
    '<button data-act="panel" title="주석 정리·AI 요약 패널 (단축키 ' + modLabel("3") + ')">📋 정리·AI</button>' +
    '<span class="ca-sep"></span>' +
    '<button data-act="notion" title="Notion 인박스 DB로 저장 (단축키 ' + modLabel("4") + ')">📝 Notion</button>' +
    "</span>" +
    '<button class="ca-bar-min" data-act="bar-min" title="도구막대 접기/펼치기 (단축키 `)">▸</button>';
  bar.classList.add("ca-bar-collapsed"); // 기본은 접힌 상태

  // 모드 활성 신호: 화면 가장자리 테두리 + 배지 (클릭 통과)
  const modeFx = document.createElement("div");
  modeFx.className = "ca-modefx";
  modeFx.appendChild(document.createElement("span")); // 배지 텍스트 담길 자리
  document.documentElement.appendChild(modeFx);
  document.documentElement.appendChild(bar);

  // 주석 hover 시 뜨는 미니 툴바 — 네모는 [🤖][🖼][✕], 형광펜은 [🤖][📋][✕] (전체삭제는 정리 탭 헤더로 이동)
  const tools = document.createElement("div");
  tools.className = "ca-tools";
  tools.style.display = "none";
  const btnAsk = document.createElement("button");
  btnAsk.className = "ca-tool";
  btnAsk.textContent = "🤖";
  btnAsk.title = "이 주석에 AI로 질문";
  const btnCopyTxt = document.createElement("button"); // 형광펜 전용 — 문장 텍스트 복사
  btnCopyTxt.className = "ca-tool";
  btnCopyTxt.textContent = "📋";
  btnCopyTxt.title = "이 형광펜 문장을 복사";
  const btnCopyImg = document.createElement("button"); // 네모 전용 — 캡처를 실제 PNG로 클립보드 복사
  btnCopyImg.className = "ca-tool";
  btnCopyImg.textContent = "🖼";
  btnCopyImg.title = "이 캡처를 이미지로 복사 (Notion·한글·Word에 붙여넣기)";
  const btnDel = document.createElement("button");
  btnDel.className = "ca-tool ca-tool-del";
  btnDel.textContent = "✕";
  btnDel.title = "이 주석만 삭제";
  tools.append(btnAsk, btnCopyTxt, btnCopyImg, btnDel);
  document.documentElement.appendChild(tools);

  // AI 결과 표시 패널
  const panel = document.createElement("div");
  panel.className = "ca-panel";
  panel.style.display = "none";
  panel.innerHTML =
    '<div class="ca-panel-head">' +
    '<span class="ca-panel-title">정리·AI</span>' +
    '<button class="ca-panel-mark" title="선택한 글자를 빨강 표시(토글). 단축키 ~ (Shift+백틱)">`<span class="ca-mark-a">A</span>`</button>' +
    '<button class="ca-panel-clearmark" title="빨강 표시 모두 해제">↺</button>' +
    '<span class="ca-panel-sep ca-sep1"></span>' +
    '<button class="ca-panel-copy" title="복사(인용문 텍스트 — 이미지는 네모의 🖼로 개별 복사)">📋</button>' +
    '<button class="ca-panel-pdf" title="PDF로 저장">💾</button>' +
    '<button class="ca-panel-min" title="최소화/펼치기">▾</button></div>' +
    '<div class="ca-panel-tabs">' +
    '<button class="ca-tab" data-tab="annotations">주석 정리</button>' +
    '<button class="ca-tab" data-tab="summary">AI 요약</button>' +
    '<button class="ca-panel-resum" title="AI 요약 다시하기">🔄</button>' +
    '<button class="ca-panel-clearall" title="이 페이지 주석 전체 삭제">🗑 전체삭제</button>' +
    "</div>" +
    '<div class="ca-panel-body"></div>' +
    // 주석 정리 탭 전용 하단 고정 입력창 — 본문(재렌더 대상) 밖이라 새 주석이 들어와도 입력 글자 유지.
    '<div class="ca-note-composer" contenteditable="true" data-ph="노트 입력 후 Enter (Shift+Enter 줄바꿈)…"></div>';
  document.documentElement.appendChild(panel);
  const panelBody = panel.querySelector(".ca-panel-body");
  const noteComposer = panel.querySelector(".ca-note-composer");
  // 주석 정리 탭의 ✕ 삭제 / + 노트삽입 — 이벤트 위임(렌더 때마다 다시 거는 일 없이 한 번만)
  panelBody.addEventListener("click", (e) => {
    const del = e.target.closest(".ca-anno-del");
    if (del) return deleteAnnotationById(del.getAttribute("data-ca-del"));
    const ai = e.target.closest(".ca-anno-ai");
    if (ai) return askAnnotation(annotations.find((a) => a.id === ai.getAttribute("data-ca-ai")));
    const cp = e.target.closest(".ca-anno-copy");
    if (cp) {
      const ann = annotations.find((a) => a.id === cp.getAttribute("data-ca-copy"));
      return cp.getAttribute("data-kind") === "img"
        ? copyAnnotationImage(ann, cp)
        : copyAnnotationText(ann, cp);
    }
    const add = e.target.closest(".ca-note-add");
    if (add) return insertNoteAfter(add.getAttribute("data-after"));
    const mv = e.target.closest(".ca-note-mv");
    if (mv) return moveNote(mv.getAttribute("data-note-move"), Number(mv.getAttribute("data-dir")));
    const ts = e.target.closest(".ca-ts");
    if (ts) {
      const vids = document.querySelectorAll("video");
      const v = vids[Number(ts.getAttribute("data-seek"))] || vids[0];
      if (v) {
        v.currentTime = Number(ts.getAttribute("data-t"));
        v.scrollIntoView({ block: "center", behavior: "smooth" });
      }
    }
  });
  // 노트·캡션 인라인 편집 — 데이터만 갱신(재렌더 X, 포커스 유지). innerText 로 줄바꿈 보존.
  panelBody.addEventListener("input", (e) => {
    const note = e.target.closest("[data-note-edit]");
    if (note) {
      const a = annotations.find((x) => x.id === note.getAttribute("data-note-edit"));
      if (a) a.text = note.innerText;
      return;
    }
    const cap = e.target.closest("[data-cap-edit]");
    if (cap) {
      const a = annotations.find((x) => x.id === cap.getAttribute("data-cap-edit"));
      if (a) a.caption = cap.innerText;
    }
  });
  // 한글 등 IME 조합 중에는 재렌더를 보류(조합 깨짐 방지). 보류된 갱신이 있을 때만 조합 끝에 flush.
  let panelComposing = false;
  let panelRefreshPending = false;
  panelBody.addEventListener("compositionstart", () => (panelComposing = true));
  panelBody.addEventListener("compositionend", () => {
    panelComposing = false;
    if (panelRefreshPending) {
      panelRefreshPending = false;
      refreshAnnotationsPanel();
    }
  });
  let panelRaw = ""; // 복사용 원문(마크다운)
  let panelTitle = "";
  let panelIsMd = false;
  let panelKind = ""; // "summary" | "qa" | "text" | "annotations" — 패널 💾/🔄 분기
  let summaryCache = null; // { sig, text } — 같은 주석이면 재요약 호출 안 함

  // 패널을 도구막대와 한 몸으로 유지. panelPos 는 패널의 viewport 좌표를 숨겨져 있어도 추적한다
  // (display:none 이면 getBoundingClientRect 가 0 이라 직접 못 읽으므로). 표시할 때 이 위치로 복원.
  let panelPos = null; // {top, left}
  // 패널을 표시할 때 도구막대 바로 아래·같은 가로폭·좌측 정렬로 맞춰 '한 몸'처럼 보이게 한다.
  // (도구막대가 접혀 있으면 폭/좌측 정렬은 생략하고 추적 위치만 복원.)
  function applyPanelPos() {
    const collapsed = bar.classList.contains("ca-bar-collapsed");
    const br = bar.getBoundingClientRect();
    if (!panelPos) panelPos = { top: br.bottom + 8, left: br.left }; // 최초: 도구막대 바로 아래
    if (!collapsed) {
      panel.style.width = br.width + "px"; // 가로폭 = 도구막대 폭(패널만 넓어짐)
      panelPos.left = br.left; // 좌측 정렬 → 좌·우변 모두 도구막대와 일치
    }
    panel.style.bottom = "auto";
    panel.style.right = "auto";
    panel.style.top = panelPos.top + "px";
    panel.style.left = panelPos.left + "px";
  }
  // 최소화/펼치기 — 헤더만 남기고 본문 접기
  const minBtn = panel.querySelector(".ca-panel-min");
  minBtn.addEventListener("click", () => {
    minBtn.textContent = panel.classList.toggle("ca-min") ? "▴" : "▾";
  });
  // 🔄 다시 요약 — 주석이 바뀌어 갱신하고 싶을 때 강제 재호출(요약 패널일 때만 보임)
  const resumBtn = panel.querySelector(".ca-panel-resum");
  resumBtn.addEventListener("click", () => aiSummarize(true));
  // 🗑 전체삭제 — 탭줄 오른쪽(주석 정리 탭일 때만 보임). 미니툴바에서 이리로 이동.
  const clearAllBtn = panel.querySelector(".ca-panel-clearall");
  clearAllBtn.addEventListener("click", () => clearAllAnnotations());
  const copyBtn = panel.querySelector(".ca-panel-copy");
  copyBtn.addEventListener("click", () => copyPanel());

  // 헤더 버튼·하위탭 가시성을 panelKind 에 맞춰 동기화
  // 주석정리: `·↺ | 💾   /   AI요약: `·↺ | 🔄 | 📋·💾   /   qa: 📋·💾   /   text·notion: (없음)
  const pdfBtn = panel.querySelector(".ca-panel-pdf");
  const sep1 = panel.querySelector(".ca-sep1");
  const tabBar = panel.querySelector(".ca-panel-tabs");
  const tabBtns = panel.querySelectorAll(".ca-tab");
  function syncPanelChrome() {
    const k = panelKind;
    const isAnn = k === "annotations";
    const isSum = k === "summary";
    const tabbed = isAnn || isSum;
    const sh = (el, v) => (el.style.display = v ? "" : "none");
    sh(markBtn, tabbed);
    sh(clearmarkBtn, tabbed);
    sh(sep1, tabbed);
    sh(resumBtn, isSum); // 🔄 는 탭줄에 있고 AI 요약 탭일 때만 보임
    sh(clearAllBtn, isAnn); // 🗑 전체삭제는 주석 정리 탭일 때만 보임
    sh(copyBtn, isSum || k === "qa");
    sh(pdfBtn, tabbed || k === "qa");
    sh(tabBar, tabbed);
    sh(noteComposer, isAnn); // 하단 노트 입력창은 주석 정리 탭에서만
    tabBtns.forEach((b) => b.classList.toggle("active", b.dataset.tab === k));
  }
  tabBtns.forEach((b) => b.addEventListener("click", () => openPanelTab(b.dataset.tab)));

  // 통합 패널 열기 — 하위탭 분기. AI 요약 탭은 누르면 바로 요약(캐시 있으면 캐시 표시).
  function openPanelTab(tab) {
    if (tab === "summary") aiSummarize();
    else showAnnotationsPanel();
  }
  // 통합 버튼/단축키 — 같은 탭이 열려 있으면 닫고, 아니면 그 탭을 연다(토글).
  function togglePanelTab(tab) {
    const open = panel.style.display !== "none";
    if (open && panelKind === tab) panel.style.display = "none";
    else openPanelTab(tab);
  }
  // 주석 정리 복사 — 패널 DOM 대신 '깨끗한 시맨틱 HTML'(h1/blockquote/img)과 마크다운 텍스트를 같이 실어
  // 각 앱이 알아서 고른다(Word=인용+이미지, Notion=인용 블록, 한글=텍스트). 이미지는 네모의 🖼 버튼으로 개별 복사.
  // 그 외(요약 등) 패널은 기존대로 마크다운/텍스트 복사.
  async function copyPanel() {
    if (panelKind === "annotations") {
      const items = collectSorted();
      const esc = (s) =>
        String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
      let html = "<h1>" + esc(document.title) + "</h1>";
      let text = "";
      for (const it of items) {
        if (it.type === "highlight") {
          html += "<blockquote>" + esc(it.text) + "</blockquote>";
          text += "> " + it.text + "\n\n";
        } else if (it.image) {
          html += '<p><img src="' + it.image + '" alt="capture"></p>';
          text += "[캡처 이미지]\n\n";
        }
      }
      try {
        await navigator.clipboard.write([
          new ClipboardItem({
            "text/html": new Blob([html], { type: "text/html" }),
            "text/plain": new Blob([text], { type: "text/plain" }),
          }),
        ]);
      } catch (e) {
        navigator.clipboard.writeText(text).catch(() => {}); // 폴백: 텍스트만
      }
      return;
    }
    navigator.clipboard.writeText(getPanelMarkdown()).catch(() => {});
  }
  // 패널 💾 — 주석 정리 미리보기면 주석 PDF, 그 외(요약)면 요약 PDF
  panel.querySelector(".ca-panel-pdf").addEventListener("click", () =>
    panelKind === "annotations" ? exportPDF() : exportSummaryPDF()
  );

  // 요소를 핸들로 잡고 드래그해 이동(도구막대·패널 공용).
  // Pointer Capture 사용 — 페이지에 광고 iframe이 많아도 포인터 이벤트를 핸들이 독점해
  // 커서가 iframe 위를 지나도 드래그가 끊기지 않는다(mousemove 방식의 한계 회피).
  // rightAnchored=true 면 left 대신 right 로 위치를 잡는다(도구막대용 — 접힘이 항상 왼쪽으로 자라게).
  // linked: 함께 끌려오는 요소(왼쪽 기준). 보일 때만 같은 픽셀 델타로 따라 움직인다.
  function makeDraggable(target, handle, rightAnchored, linked) {
    let sx = 0; // 포인터 시작 좌표
    let sy = 0;
    let tTop0 = 0; // 드래그 시작 시 target 위치
    let tLeft0 = 0;
    let tRight0 = 0;
    let offX = 0; // linked(패널)의 target(도구막대) 대비 고정 오프셋
    let offY = 0;
    let linkActive = false;
    let dragging = false;
    handle.addEventListener("pointerdown", (e) => {
      if (e.button !== 0 || e.target.closest("button")) return; // 버튼 클릭 제외
      const r = target.getBoundingClientRect();
      sx = e.clientX;
      sy = e.clientY;
      tTop0 = r.top;
      dragging = true;
      target.style.bottom = "auto";
      target.style.top = r.top + "px";
      if (rightAnchored) {
        tRight0 = window.innerWidth - r.right;
        target.style.left = "auto";
        target.style.right = tRight0 + "px";
      } else {
        tLeft0 = r.left;
        target.style.right = "auto";
        target.style.left = r.left + "px";
      }
      // 패널은 도구막대 대비 '고정 오프셋'으로 따라온다(숨겨져 있어도). 위치를 도구막대 실제
      // 위치에서 매번 다시 계산하므로 좌/우 기준 차이로 인한 어긋남(드리프트)이 누적되지 않는다.
      linkActive = false;
      if (linked) {
        if (!panelPos && linked.style.display !== "none") {
          const lr = linked.getBoundingClientRect();
          panelPos = { top: lr.top, left: lr.left };
        }
        if (panelPos) {
          linkActive = true;
          offX = panelPos.left - r.left; // r = 도구막대 시작 rect
          offY = panelPos.top - r.top;
        }
      }
      handle.setPointerCapture(e.pointerId);
      e.preventDefault();
    });
    handle.addEventListener("pointermove", (e) => {
      if (!dragging) return;
      const ddx = e.clientX - sx;
      const ddy = e.clientY - sy;
      target.style.top = Math.max(0, Math.min(window.innerHeight - 30, tTop0 + ddy)) + "px";
      if (rightAnchored) {
        target.style.right = Math.max(0, Math.min(window.innerWidth - 40, tRight0 - ddx)) + "px";
      } else {
        target.style.left = Math.max(0, Math.min(window.innerWidth - 40, tLeft0 + ddx)) + "px";
      }
      if (linkActive) {
        const br = target.getBoundingClientRect(); // 도구막대의 '실제' 위치(clamp 반영) + 오프셋
        const nt = br.top + offY;
        const nl = br.left + offX;
        panelPos.top = nt; // 추적값 갱신(숨겨져 있어도) → 다시 열 때 따라온 위치로
        panelPos.left = nl;
        if (linked.style.display !== "none") {
          linked.style.bottom = "auto";
          linked.style.right = "auto";
          linked.style.top = nt + "px";
          linked.style.left = nl + "px";
        }
      }
    });
    const end = (e) => {
      if (!dragging) return;
      dragging = false;
      try {
        handle.releasePointerCapture(e.pointerId);
      } catch (_) {}
    };
    handle.addEventListener("pointerup", end);
    handle.addEventListener("pointercancel", end);
  }

  // 도구막대 ⠿ 손잡이 하나로 도구막대+패널을 함께 이동(오른쪽 고정). 패널은 별도 핸들 없음.
  makeDraggable(bar, bar.querySelector(".ca-grip"), true, panel);

  // 빨강 표시 — 모드 토글. 켜두면(활성·버튼 빨강) 패널에서 선택만 해도(드래그 mouseup) 표시/해제됨.
  // 단축키 Shift+백틱(~)도 버튼 클릭과 완전히 동일 — 모드 ON 후 드래그하면 자동 표시. (백틱 단독은 도구막대 토글)
  let markMode = false;
  const markBtn = panel.querySelector(".ca-panel-mark");
  // 버튼·단축키 공용 — 모드 토글 + 버튼 활성색 + 현재 선택 즉시 적용.
  const toggleMarkMode = () => {
    markMode = !markMode;
    markBtn.classList.toggle("active", markMode);
    toggleMarkSelection(); // 선택돼 있으면 즉시 적용
  };
  markBtn.addEventListener("mousedown", (e) => e.preventDefault());
  markBtn.addEventListener("click", toggleMarkMode);
  panelBody.addEventListener("mouseup", () => {
    if (markMode) setTimeout(toggleMarkSelection, 0); // 선택 확정 후 적용
  });
  document.addEventListener("keydown", (e) => {
    if (extHidden) return; // 확장이 꺼져 있으면 ~ 표시 토글도 무시
    // 닿는 탭: AI 요약(md) + 주석 정리(빨강 표시 버튼 가시성과 일치 — syncPanelChrome).
    if (e.key !== "~" || !(panelIsMd || panelKind === "annotations")) return;
    // 입력칸(노트·페이지 폼)에 포커스 중이면 ~ 는 글자 입력 — 모드 토글 안 함.
    const ae = document.activeElement;
    if (ae && (ae.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName))) return;
    e.preventDefault();
    toggleMarkMode(); // 버튼 클릭과 동일하게 처리(모드 토글 → 드래그 시 자동 표시 + 버튼 색 동기화)
  });

  // 빨강 표시 전체 해제
  const clearmarkBtn = panel.querySelector(".ca-panel-clearmark");
  clearmarkBtn.addEventListener("click", () => {
    panelBody.querySelectorAll("code.ca-mark").forEach(unwrapMark);
  });

  // 빨강 표시에 마우스 올리면 우상단 × → 클릭 시 그 표시만 해제
  const markDel = document.createElement("button");
  markDel.className = "ca-markdel";
  markDel.textContent = "✕";
  markDel.style.display = "none";
  panel.appendChild(markDel);
  let markDelTarget = null;
  let markDelTimer = null;
  const placeMarkDel = () => {
    if (!markDelTarget) return;
    const r = markDelTarget.getBoundingClientRect();
    markDel.style.left = r.right - 6 + "px";
    markDel.style.top = r.top - 8 + "px";
  };
  const hideMarkDel = () => {
    markDelTimer = setTimeout(() => {
      markDel.style.display = "none";
      markDelTarget = null;
    }, 250);
  };
  panelBody.addEventListener("mouseover", (e) => {
    const code = e.target.closest("code.ca-mark");
    if (!code) return;
    markDelTarget = code;
    markDel.style.display = "block";
    placeMarkDel();
    clearTimeout(markDelTimer);
  });
  panelBody.addEventListener("mouseout", (e) => {
    if (e.target.closest("code.ca-mark")) hideMarkDel();
  });
  markDel.addEventListener("mouseenter", () => clearTimeout(markDelTimer));
  markDel.addEventListener("mouseleave", hideMarkDel);
  markDel.addEventListener("mousedown", (e) => e.preventDefault());
  markDel.addEventListener("click", () => {
    if (markDelTarget) unwrapMark(markDelTarget);
    markDel.style.display = "none";
    markDelTarget = null;
  });
  panelBody.addEventListener("scroll", () => {
    if (markDelTarget && markDel.style.display !== "none") placeMarkDel();
  });
  function showPanel(title, text, isMd, kind) {
    panel.classList.remove("ca-min"); // 새 내용이 오면 펼침
    minBtn.textContent = "▾";
    panel.querySelector(".ca-panel-title").textContent = title;
    panelTitle = title;
    panelIsMd = !!isMd;
    panelKind = kind || (isMd ? "summary" : "text");
    panelRaw = text;
    if (isMd) {
      panelBody.style.whiteSpace = "normal";
      panelBody.innerHTML = renderMarkdown(text);
    } else {
      panelBody.style.whiteSpace = "pre-wrap";
      panelBody.textContent = text;
    }
    panel.style.display = "flex";
    applyPanelPos();
    syncPanelChrome();
  }

  // 아웃라인 렌더러 — 모델이 쓴 번호/들여쓰기를 그대로 보존(사이트 CSS 영향 안 받음).
  // 줄 앞 🖍 = 사용자 주석(형광펜/네모)에서 나온 항목 → 코랄 강조. 출력은 escape 후 생성.
  function renderMarkdown(src) {
    const esc = (s) =>
      String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
    const inline = (s) =>
      esc(s)
        .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
        .replace(/`([^`]+?)`/g, "<code>$1</code>");
    const lines = String(src).replace(/\r/g, "").replace(/\t/g, "    ").split("\n");
    let html = "";
    for (const raw of lines) {
      if (!raw.trim()) continue;
      const spaces = raw.match(/^ */)[0].length;
      let t = raw.slice(spaces);
      const classes = ["ca-line"];
      const h = t.match(/^#{1,6}\s+(.*)$/);
      if (h) {
        t = h[1];
        classes.push("ca-md-h");
      }
      // 주석 유래 마커(연필/크레용/별 등 종류·위치 불문) → 제거하고 색으로 강조
      const annoRe = /(?:🖍|✏|🖊|🖌|📍|★|☆)️?/gu;
      let annotated = false;
      if (annoRe.test(t)) {
        annotated = true;
        t = t.replace(annoRe, "").replace(/\s{2,}/g, " ").trim();
      }
      t = t.replace(/^[-*]\s+/, "• "); // 불릿 기호 통일
      // 선두 번호 마커별 레벨/색
      const mk = t.match(/^(\d+\.|[가-힣A-Za-z]\.|\d+\)|[가-힣A-Za-z]\))\s+/);
      let lvl = "";
      if (mk) {
        const tok = mk[1];
        if (/^\d+\.$/.test(tok)) lvl = "ca-l1";
        else if (/^[가-힣A-Za-z]\.$/.test(tok)) lvl = "ca-l2";
        else if (/^\d+\)$/.test(tok)) lvl = "ca-l3";
        else lvl = "ca-l4";
      }
      const topLevel = !h && spaces === 0 && lvl === "ca-l1";
      if (topLevel) classes.push("ca-sec"); // 최상위 단락 = 파란 제목 + 간격

      let inner;
      if (!h && mk && !topLevel) {
        // 하위 단계: 번호 마커만 색칠, 본문은 기본색
        inner =
          "<span class='ca-mk " + lvl + "'>" + esc(mk[1]) + "</span> " + inline(t.slice(mk[0].length));
      } else {
        inner = inline(t);
      }
      if (annotated) inner = "<span class='ca-anno-mark'>" + inner + "</span>"; // 텍스트에만 코랄 배경

      const pad = h ? 0 : spaces * 8; // 모델 들여쓰기를 시각적 padding 으로 보존
      html +=
        "<div class='" +
        classes.join(" ") +
        "' data-indent='" +
        (h ? 0 : spaces) +
        "' style='padding-left:" +
        pad +
        "px'>" +
        inner +
        "</div>";
    }
    return html;
  }

  // ----- 패널 백틱 표시(토글) & 마크다운 직렬화 -----
  const closestMark = (node) => {
    const el = node && node.nodeType === 1 ? node : node && node.parentElement;
    return el ? el.closest("code.ca-mark") : null;
  };
  function panelTextNodes(range) {
    const walker = document.createTreeWalker(panelBody, NodeFilter.SHOW_TEXT, {
      acceptNode(n) {
        if (!n.nodeValue) return NodeFilter.FILTER_REJECT;
        const r = document.createRange();
        r.selectNodeContents(n);
        const hit =
          range.compareBoundaryPoints(Range.END_TO_START, r) < 0 &&
          range.compareBoundaryPoints(Range.START_TO_END, r) > 0;
        return hit ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      },
    });
    const out = [];
    let n;
    while ((n = walker.nextNode())) out.push(n);
    return out;
  }
  function unwrapMark(code) {
    const p = code.parentNode;
    while (code.firstChild) p.insertBefore(code.firstChild, code);
    p.removeChild(code);
    p.normalize();
  }
  function toggleMarkSelection() {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return;
    const range = sel.getRangeAt(0);
    if (!panelBody.contains(range.commonAncestorContainer)) return;
    const sm = closestMark(range.startContainer);
    if (sm && sm === closestMark(range.endContainer)) {
      unwrapMark(sm); // 이미 표시된 곳 → 해제
    } else {
      panelTextNodes(range).forEach((node) => {
        if (closestMark(node)) return; // 이미 마크면 건너뜀
        const start = node === range.startContainer ? range.startOffset : 0;
        const end = node === range.endContainer ? range.endOffset : node.nodeValue.length;
        if (start >= end) return;
        const r = document.createRange();
        r.setStart(node, start);
        r.setEnd(node, end);
        const code = document.createElement("code");
        code.className = "ca-mark";
        try {
          r.surroundContents(code);
        } catch (_) {}
      });
    }
    sel.removeAllRanges();
  }
  function serializeInline(el) {
    let s = "";
    el.childNodes.forEach((n) => {
      if (n.nodeType === 3) s += n.nodeValue;
      else if (n.nodeName === "STRONG") s += "**" + serializeInline(n) + "**";
      else if (n.nodeName === "CODE") s += "`" + n.textContent + "`";
      else s += serializeInline(n); // span(레벨색·코랄) 등은 내부만
    });
    return s;
  }
  // 노션이 인식하는 중첩 리스트로 변환: 탭 들여쓰기 + '1.'(노션이 1/a/i 자동), 빈 줄 없음.
  // 화면에 보이는 '가./1)' 리터럴 마커는 제거하고 노션이 자체 번호를 매기게 한다.
  function panelToMarkdown() {
    const out = [];
    panelBody.querySelectorAll(".ca-line").forEach((div) => {
      if (div.classList.contains("ca-md-h")) {
        out.push("## " + serializeInline(div).trim());
        return;
      }
      const indent = +(div.dataset.indent || 0);
      const depth = Math.min(8, Math.round(indent / 4));
      let text = serializeInline(div).trim();
      const m = text.match(/^(\d+[.)]|[가-힣A-Za-z][.)]|•)\s+/);
      let bullet = false;
      if (m) {
        bullet = m[1] === "•";
        text = text.slice(m[0].length);
      }
      out.push("\t".repeat(depth) + (bullet ? "- " : "1. ") + text);
    });
    return out.join("\n");
  }
  function getPanelMarkdown() {
    return panelIsMd ? panelToMarkdown() : panelBody.textContent || "";
  }

  const isUI = (node) =>
    bar.contains(node) ||
    tools.contains(node) ||
    panel.contains(node) ||
    (captureBtn && captureBtn.contains(node));

  function applyMode(m) {
    mode = m;
    bar.querySelectorAll("button[data-mode]").forEach((b) =>
      b.classList.toggle("active", b.dataset.mode === m)
    );
    const root = document.documentElement;
    if (m !== "rect") hideMagnet(); // 네모 모드를 벗어나면 영상 자석 강조 제거
    root.classList.toggle("ca-rect-cursor", m === "rect");
    root.classList.toggle("ca-hl-cursor", m === "highlight"); // 형광펜 = I빔 커서
    // 화면 가장자리 신호(테두리+배지) — 어느 페이지서든 모드 활성 여부가 한눈에 보임
    modeFx.className = "ca-modefx" + (m ? " ca-on ca-" + m : "");
    modeFx.firstChild.textContent = m === "highlight" ? "🖊️ 형광펜 ON" : m === "rect" ? "⬚ 네모 ON" : "";
  }

  // 형광펜을 켤 때 이미 선택된 텍스트가 있으면 그 부분도 바로 주석 처리
  function activateHighlight() {
    const sel = window.getSelection();
    const hasSel = sel && !sel.isCollapsed && !isUI(sel.anchorNode);
    applyMode("highlight");
    if (hasSel) highlightSelection();
  }

  // 도구막대 접기/펼치기 — 버튼·단축키(백틱) 공용.
  // 접으면 패널을 완전히 숨기고(도구막대 최소화만 보임), 펼칠 때 원래 열려 있었으면 같이 복원.
  let panelHiddenByBar = false;
  function toggleBar() {
    const collapsed = bar.classList.toggle("ca-bar-collapsed");
    bar.querySelector(".ca-bar-min").textContent = collapsed ? "▸" : "▾";
    if (collapsed) {
      if (panel.style.display !== "none") {
        panelHiddenByBar = true; // 펼칠 때 다시 열도록 기억
        panel.style.display = "none";
      }
    } else if (panelHiddenByBar) {
      panel.style.display = "flex";
      applyPanelPos();
      panelHiddenByBar = false;
      refreshAnnotationsPanel(); // 숨겨진 동안 추가된 주석을 복원 즉시 반영(내부 가드: 정리탭+표시 중에만)
    }
  }

  // 첫 주석 작성 시: 접혀 있던 도구막대를 펼치고 '정리' 탭을 열어 방금 정리된 주석을 바로 보여준다.
  // (페이지 로드당 1회만 — 이후엔 사용자가 직접 토글)
  let firstAnnotationRevealed = false;
  let backtickUsed = false; // 백틱으로 '처음 펼칠 때'만 형광펜까지 켜기 위한 1회용 플래그
  function revealOnFirstAnnotation() {
    if (firstAnnotationRevealed || annotations.length === 0) return;
    firstAnnotationRevealed = true;
    if (bar.classList.contains("ca-bar-collapsed")) toggleBar();
    showAnnotationsPanel();
  }

  bar.addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    if (btn.dataset.act === "bar-min") {
      toggleBar();
      return;
    }
    if (btn.dataset.act === "panel") return togglePanelTab("annotations");
    if (btn.dataset.act === "notion") return exportNotion();
    if (btn.dataset.act === "off") return applyMode(null);
    if (btn.dataset.mode === "highlight" && mode !== "highlight") return activateHighlight();
    applyMode(mode === btn.dataset.mode ? null : btn.dataset.mode);
  });

  // 도구막대 버튼 클릭이 페이지의 텍스트 선택을 지우지 않게 (선택 후 형광펜 눌러도 유지)
  bar.addEventListener("mousedown", (e) => {
    if (e.target.closest("button")) e.preventDefault();
  });

  // 단축키: ` 도구막대 접기/펼치기(처음 펼칠 때만 형광펜까지 ON), Esc 모드 해제 / Alt(맥 Option)+1~4 기능.
  // 영상 캡처: 윈도우 F4 / 맥 Option+백틱(맥은 F4를 OS가 가로채 불안정 — 윈도우엔 Alt+백틱 안 묶음).
  // (Alt 를 붙여 YouTube 등 사이트의 단일키 단축키와 안 겹치게 함)
  document.addEventListener("keydown", (e) => {
    if (extHidden) return; // 확장이 꺼진(미니팝업 OFF) 상태면 단축키(백틱 등) 무시
    if (e.ctrlKey || e.metaKey) return; // 브라우저 조합키와 충돌 방지
    const el = document.activeElement;
    const typing =
      el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
    if (typing && !e.altKey) return; // 타이핑 중엔 무모디파이어 단축키(백틱·Esc)만 무시, Alt 조합은 허용
    if (!e.altKey) {
      if (e.key === "`") {
        e.preventDefault();
        const wasCollapsed = bar.classList.contains("ca-bar-collapsed");
        toggleBar(); // 백틱: 도구막대(+패널) 접기/펼치기
        if (!backtickUsed && wasCollapsed) activateHighlight(); // 처음 펼칠 때만 형광펜 ON
        backtickUsed = true;
      } else if (e.key === "F4") {
        e.preventDefault();
        const v = pickVideoForShortcut(); // 마우스 밑 영상 → 없으면 화면 최대 영상
        if (v) triggerVideoCapture(v);
      } else if (e.key === "Escape" && mode) {
        applyMode(null);
      }
      return;
    }
    // 맥: Option+백틱 = 영상 캡처 (윈도우는 F4 사용 — 윈도우엔 Alt+백틱을 안 묶어 PowerToys 등과 충돌 없음)
    if (IS_MAC && e.code === "Backquote") {
      e.preventDefault();
      const v = pickVideoForShortcut();
      if (v) triggerVideoCapture(v);
      return;
    }
    // Alt(맥은 Option) + 숫자 — e.code(물리 키 위치)로 매칭해 맥에서 Option+숫자가 특수문자(™ 등)로
    // 바뀌어 e.key 가 안 맞던 문제를 피한다. preventDefault 로 그 특수문자 입력도 차단.
    switch (e.code) {
      case "Digit1":
        e.preventDefault();
        mode === "highlight" ? applyMode(null) : activateHighlight();
        break;
      case "Digit2":
        e.preventDefault();
        applyMode(mode === "rect" ? null : "rect");
        break;
      case "Digit3":
        e.preventDefault();
        togglePanelTab("annotations");
        break;
      case "Digit4":
        e.preventDefault();
        exportNotion();
        break;
    }
  });

  // 확장 아이콘 클릭 → 확장 UI 전체(툴바+패널+미니툴바) 표시/숨김 토글
  let extHidden = false;
  let panelDisplayBeforeHide = "none";
  chrome.runtime.onMessage.addListener((msg) => {
    if (!msg || msg.type !== "toggle-toolbar") return;
    extHidden = !extHidden;
    bar.classList.toggle("ca-hidden", extHidden);
    // 페이지의 형광펜·네모(영상 캡처 제외 — 그건 이미 박스 없음)도 함께 숨김/복원
    document.documentElement.classList.toggle("ca-ext-off", extHidden);
    if (extHidden) {
      panelDisplayBeforeHide = panel.style.display;
      panel.style.display = "none";
      tools.style.display = "none";
      applyMode(null); // 그리기 모드·커서 해제(끈 상태에선 새 주석도 안 그려지게)
    } else {
      panel.style.display = panelDisplayBeforeHide;
      refreshAnnotationsPanel(); // 숨김 해제 시에도 그동안의 주석 변경 반영(내부 가드로 안전)
    }
  });

  // ---------- 형광펜 ----------
  document.addEventListener("mouseup", (e) => {
    if (mode !== "highlight" || isUI(e.target)) return;
    highlightSelection();
  });

  function highlightSelection() {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    // 선택 영역에 걸친 텍스트 노드들을 각각 감싼다 (여러 태그 걸쳐도 동작)
    let lastId = null;
    getSelectedTextNodes(range).forEach((node) => {
      const start = node === range.startContainer ? range.startOffset : 0;
      const end = node === range.endContainer ? range.endOffset : node.nodeValue.length;
      if (start >= end) return;
      const id = wrapTextNode(node, start, end);
      if (id) lastId = id;
    });
    sel.removeAllRanges();
    refreshAnnotationsPanel();
    revealOnFirstAnnotation();
    if (lastId) scrollPanelTo(lastId); // 방금 친 형광펜 항목이 패널에 보이도록(네모와 동일 동작)
  }

  function getSelectedTextNodes(range) {
    const rootRaw = range.commonAncestorContainer;
    const root = rootRaw.nodeType === 3 ? rootRaw.parentNode : rootRaw;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(n) {
        if (!n.nodeValue || !n.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
        if (isUI(n.parentNode)) return NodeFilter.FILTER_REJECT; // 확장 UI 안쪽은 형광펜 제외
        const r = document.createRange();
        r.selectNodeContents(n);
        const intersects =
          range.compareBoundaryPoints(Range.END_TO_START, r) < 0 &&
          range.compareBoundaryPoints(Range.START_TO_END, r) > 0;
        return intersects ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      },
    });
    const nodes = [];
    let n;
    while ((n = walker.nextNode())) nodes.push(n);
    return nodes;
  }

  function wrapTextNode(node, start, end) {
    const r = document.createRange();
    r.setStart(node, start);
    r.setEnd(node, end);
    const span = document.createElement("span");
    span.className = HL;
    span.dataset.caId = uid();
    try {
      r.surroundContents(span); // 단일 텍스트노드 범위라 항상 성공
      annotations.push({ type: "highlight", id: span.dataset.caId, text: span.textContent });
      return span.dataset.caId;
    } catch (_) {
      /* 드물게 실패하면 그 노드만 건너뜀 */
      return null;
    }
  }

  // ---------- 네모 캡처영역 드래그 ----------
  let dragStart = null;
  let dragEl = null;
  let suppressClick = false; // 드래그 직후 따라오는 click 1회 무효화 플래그
  // 방법 B(하이브리드): 영상 위라도 컨트롤(재생바·버튼)에서 시작한 제스처만 유튜브로 통과시켜
  // seek·버튼이 동작하게 하고, 영상 본문(play-surface)에서 시작한 press 는 아예 차단한다 →
  // 유튜브가 재생을 시작할 일이 없어 드래그 캡처 시 재생 깜빡임 0. 본문 단순 클릭은 우리가 직접
  // play/pause 를 토글한다. 비영상(기사 등)은 기존대로 즉시 억제.
  let overControlAtDown = false; // pointerdown 이 영상 컨트롤 위 → 네이티브 통과(캡처 안 함)
  let videoBodyAtDown = null; // pointerdown 이 영상 본문 위면 그 video (단순 클릭 시 토글 대상)

  // 영상 플레이어 컨트롤 셀렉터 — 여기서 시작한 제스처는 통과시켜 seek·버튼을 유지.
  // (유튜브 DOM 클래스 의존 — 유튜브 구조 변경 시 이 셀렉터 보수 필요.) 그 외 영상 영역은 '본문'.
  const VIDEO_CONTROL_SEL =
    ".ytp-chrome-bottom, .ytp-chrome-top, .ytp-chrome-controls, .ytp-progress-bar-container, " +
    ".ytp-progress-bar, .ytp-gradient-bottom, .ytp-gradient-top, button, a, " +
    "[role='slider'], [role='button'], input[type='range']";

  // 네모 모드의 드래그 제스처가 페이지(예: 유튜브 영상의 클릭=재생토글)에 닿지 않도록
  // 포인터 다운/업을 캡처 단계에서 가로채 페이지로의 전파를 끊는다. (우리 mouse 핸들러는 그대로 동작)
  // 단, 방법 B: 영상 '컨트롤'에서 시작한 제스처만 통과시켜 유튜브가 처리(본문 press 는 차단).
  const swallowPointer = (e) => {
    if (mode !== "rect" || isUI(e.target)) return;
    if (e.type === "pointerdown") {
      const vid = videoUnderPoint(e.clientX, e.clientY); // 영상(컨트롤 포함) 위에서 시작했나
      const onControl = vid && e.target.closest && e.target.closest(VIDEO_CONTROL_SEL);
      overControlAtDown = !!onControl;
      videoBodyAtDown = vid && !onControl ? vid.v : null;
    }
    if (overControlAtDown) return; // 컨트롤: 모든 포인터 이벤트 통과 → 유튜브가 seek/버튼 처리.
    e.stopImmediatePropagation(); // 그 외(영상 본문·비영상)는 사이트로 전파 차단.
  };
  document.addEventListener("pointerdown", swallowPointer, true);
  document.addEventListener("pointermove", swallowPointer, true);
  document.addEventListener("pointerup", swallowPointer, true);

  // Notion '새 분류' 입력칸 참조 + Enter 제출 콜백 — renderNotionPicker 가 채운다.
  // (아래 swallowTypingKeys 가 입력칸 keydown 을 삼키므로 Enter 는 거기서 이 콜백으로 처리한다.)
  let catComposer = null;
  let catComposerSubmit = null;

  // 노트·캡션 등 우리 UI 입력칸에서 타이핑할 때 키 이벤트가 페이지로 새어 사이트 단축키
  // (예: 유튜브 스페이스=재생/정지)를 건드리지 않게 캡처 단계에서 차단. preventDefault 는 안 해
  // 글자 입력 자체는 정상.
  const swallowTypingKeys = (e) => {
    const el = e.target;
    if (!isUI(el) || !(el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)))
      return;
    // 하단 노트 입력창의 Enter(완성) 처리 — 이 차단 함수가 입력창 자체 핸들러보다 먼저 돌므로 여기서 처리.
    if (
      el === noteComposer &&
      e.type === "keydown" &&
      e.key === "Enter" &&
      !e.shiftKey &&
      !e.isComposing // 한글 조합 확정용 Enter 는 제출하지 않음(한 번 더 누르면 제출)
    ) {
      e.preventDefault();
      const text = noteComposer.innerText.trim();
      if (text) addNoteAtEnd(text);
      noteComposer.textContent = "";
    }
    // Notion 내보내기 패널 '새 분류' 입력칸 Enter — 이 차단 함수가 입력칸 핸들러보다 먼저 돌아
    // 입력칸 자체 keydown 을 삼키므로, 노트와 마찬가지로 여기서 직접 추가 처리한다.
    if (
      el === catComposer &&
      e.type === "keydown" &&
      e.key === "Enter" &&
      !e.isComposing // 한글 조합 확정용 Enter 는 추가하지 않음(한 번 더 누르면 추가)
    ) {
      e.preventDefault();
      if (catComposerSubmit) catComposerSubmit();
    }
    // Alt/Ctrl/Meta 조합은 우리 단축키(Alt+숫자 등) — 페이지로 가도 무해하고 우리 핸들러에 닿아야 하므로 통과.
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    e.stopImmediatePropagation(); // 무모디파이어 키만 페이지(사이트 단축키)로 전파 차단
  };
  ["keydown", "keyup", "keypress"].forEach((evt) =>
    window.addEventListener(evt, swallowTypingKeys, true)
  );

  // 캡처 단계 + stopPropagation 으로 페이지보다 먼저 잡아 드래그 제스처를 사이트에서 격리한다.
  // 방법 B: 영상 '컨트롤'에서 시작했으면 통과(유튜브가 seek/버튼 처리, 캡처 안 함). 영상 본문·비영상은
  // 기존대로 즉시 박스 시작(press 차단 → 본문 클릭/드래그로 유튜브가 재생할 일 없음).
  document.addEventListener(
    "mousedown",
    (e) => {
      if (mode !== "rect" || e.button !== 0 || isUI(e.target)) return;
      if (overControlAtDown) return; // 컨트롤: 유튜브가 처리(통과).
      // 새 캡처/클릭 시작 시 우리 입력칸(캡션·노트) 포커스를 해제 → 스페이스 등 키가 영상으로 넘어가게.
      const ae = document.activeElement;
      if (ae && ae.isContentEditable && isUI(ae)) ae.blur();
      dragStart = { x: e.pageX, y: e.pageY };
      hideMagnet(); // 드래그(부분 캡처) 시작 → 자석 강조 제거
      e.preventDefault();
      e.stopImmediatePropagation();
      dragEl = document.createElement("div");
      dragEl.className = "ca-rect";
      document.documentElement.appendChild(dragEl);
      drawRect(e);
    },
    true
  );

  document.addEventListener("mousemove", (e) => {
    lastMouse = { x: e.clientX, y: e.clientY }; // F4 단축키가 '마우스 밑 영상'을 찾을 때 사용
    if (dragEl) drawRect(e);
    else updateMagnet(e); // 드래그 중이 아니면 영상 위 자석 강조 갱신
  });

  document.addEventListener(
    "mouseup",
    (e) => {
    if (overControlAtDown) {
      // 컨트롤 위 제스처 — 유튜브가 seek/버튼 처리. 상태만 정리.
      dragStart = null;
      videoBodyAtDown = null;
      return;
    }
    if (!dragEl) {
      dragStart = null;
      videoBodyAtDown = null;
      return;
    }
    e.stopImmediatePropagation();
    const box = boxOf(e);
    if (box.w < 8 || box.h < 8) {
      dragEl.remove(); // 너무 작으면 취소(=단순 클릭).
      // 영상 본문 단순 클릭 → 재생/정지 토글(+영상 포커스로 방향키 탐색 유지).
      // (영상 전체 캡처는 호버 시 뜨는 📷 버튼으로 분리 — 본문 클릭이 캡처를 오발동하던 문제 제거.)
      if (videoBodyAtDown) {
        const v = videoBodyAtDown;
        if (v.paused) v.play().catch(() => {});
        else v.pause();
        try {
          v.focus({ preventScroll: true });
        } catch {}
      }
    } else {
      commitRectCapture(box, dragEl);
    }
    dragEl = null;
    dragStart = null;
    videoBodyAtDown = null;
    // 드래그가 끝나면 브라우저가 click 을 한 번 더 쏜다 → 이미지/링크 팝업 방지로 1회 무효화
    suppressClick = true;
    setTimeout(() => (suppressClick = false), 0);
    },
    true
  );

  // 네모 드래그 직후의 click 을 캡처 단계에서 가로채 무효화 (페이지 핸들러보다 먼저)
  document.addEventListener(
    "click",
    (e) => {
      if (!suppressClick || isUI(e.target)) return;
      e.stopPropagation();
      e.preventDefault();
      suppressClick = false;
    },
    true
  );

  function boxOf(e) {
    return {
      x: Math.min(e.pageX, dragStart.x),
      y: Math.min(e.pageY, dragStart.y),
      w: Math.abs(e.pageX - dragStart.x),
      h: Math.abs(e.pageY - dragStart.y),
    };
  }

  // ---------- 영상 위 📷 캡처 버튼 + 점선 강조 ----------
  // 네모 모드에서 영상에 마우스를 올리면 우상단 모서리에 📷 버튼을 띄운다. 그 버튼에 마우스를
  // 올리면 비로소 영상 전체 사각형을 점선 강조해 "이 영역이 캡처된다"를 보여준다(직관성). 버튼
  // 클릭 = 영상 전체 1장 캡처(영상 본문 클릭은 재생/정지). 버튼은 드래그로 이동 가능하고 위치는 저장된다.
  let magnetEl = null;
  let magnetVideo = null; // 현재 자석이 가리키는 {v, idx}
  let lastMouse = null; // 마지막 마우스 뷰포트 좌표 — F4 단축키가 '마우스 밑 영상'을 찾는 데 사용
  let captureBtn = null; // 자석 위 📷 캡처 버튼(처음 필요할 때 생성)
  let captureBtnDragging = false; // 버튼 드래그 중 — updateMagnet 이 버튼을 숨기지 않게
  let captureBtnOffset = { dx: 0, dy: 0 }; // 영상 우상단 기준 이동 오프셋(드래그로 변경·저장)
  chrome.storage.local.get("ca_capbtn_offset").then(({ ca_capbtn_offset }) => {
    if (ca_capbtn_offset) captureBtnOffset = ca_capbtn_offset;
  });

  function removeMagnetOutline() {
    if (magnetEl) {
      magnetEl.remove();
      magnetEl = null;
    }
  }
  // 영상 점선 강조 — 버튼 위에 올렸을 때만 "이 영역이 캡처된다"를 보여준다. r = 영상 뷰포트 사각형.
  function showMagnetOutline(r) {
    if (!magnetEl) {
      magnetEl = document.createElement("div");
      magnetEl.className = "ca-magnet";
      document.documentElement.appendChild(magnetEl);
    }
    Object.assign(magnetEl.style, {
      left: r.left + window.scrollX + "px",
      top: r.top + window.scrollY + "px",
      width: r.width + "px",
      height: r.height + "px",
    });
  }
  function hideMagnet() {
    removeMagnetOutline();
    magnetVideo = null;
    if (captureBtn) captureBtn.style.display = "none";
  }

  function ensureCaptureBtn() {
    if (captureBtn) return captureBtn;
    captureBtn = document.createElement("button");
    captureBtn.className = "ca-capbtn";
    captureBtn.type = "button";
    // 아이콘 전용 — 호버 시 이모지만 📷→📸 로 교체(폭 불변 → 위치 안 들썩임).
    captureBtn.innerHTML =
      '<span class="ca-capbtn-ico">' +
      '<span class="ca-def">📷</span><span class="ca-hov">📸</span></span>';
    captureBtn.title = "이 영상 전체를 캡처 — 단축키 " + capLabel + " (드래그하면 버튼 이동)";
    captureBtn.style.display = "none";
    document.documentElement.appendChild(captureBtn);
    wireCaptureBtn();
    return captureBtn;
  }

  // 버튼 위치: 영상 우상단 모서리 안쪽 + 저장된 이동 오프셋. r = 영상 뷰포트 사각형.
  function positionCaptureBtn(r) {
    if (!captureBtn) return;
    const bw = captureBtn.offsetWidth || 34;
    captureBtn.style.left =
      r.right - bw - 8 + window.scrollX + captureBtnOffset.dx + "px";
    captureBtn.style.top = r.top + 8 + window.scrollY + captureBtnOffset.dy + "px";
  }

  // 버튼: 단순 클릭 = 캡처, 드래그(>5px) = 이동(오프셋 저장). 포인터 캡처로 영상 밖까지 끌 수 있음.
  function wireCaptureBtn() {
    let down = null;
    let moved = false;
    captureBtn.addEventListener("pointerdown", (e) => {
      e.stopPropagation();
      down = { x: e.clientX, y: e.clientY, dx: captureBtnOffset.dx, dy: captureBtnOffset.dy };
      moved = false;
      try {
        captureBtn.setPointerCapture(e.pointerId);
      } catch {}
    });
    captureBtn.addEventListener("pointermove", (e) => {
      if (!down) return;
      const ddx = e.clientX - down.x;
      const ddy = e.clientY - down.y;
      if (!moved && Math.hypot(ddx, ddy) > 5) {
        moved = true;
        captureBtnDragging = true; // 이제부터 updateMagnet 이 버튼을 숨기지 않게
      }
      if (moved) {
        captureBtnOffset = { dx: down.dx + ddx, dy: down.dy + ddy };
        if (magnetVideo) positionCaptureBtn(magnetVideo.v.getBoundingClientRect());
      }
    });
    captureBtn.addEventListener("pointerup", (e) => {
      if (!down) return;
      try {
        captureBtn.releasePointerCapture(e.pointerId);
      } catch {}
      const wasMoved = moved;
      down = null;
      moved = false;
      captureBtnDragging = false;
      if (wasMoved) chrome.storage.local.set({ ca_capbtn_offset: captureBtnOffset });
      else triggerVideoCapture();
    });
    // 클릭(캡처/이동 직후 따라오는 click)이 페이지로 새지 않도록 무효화.
    captureBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      e.preventDefault();
    });
  }

  // 📷 버튼 클릭(인자 없음) → 현재 자석이 가리키는 영상. F4 단축키 → 인자로 받은 영상.
  function triggerVideoCapture(videoEl) {
    const v = videoEl || (magnetVideo && magnetVideo.v);
    if (!v) return;
    const r = v.getBoundingClientRect();
    const fullBox = {
      x: r.left + window.scrollX,
      y: r.top + window.scrollY,
      w: r.width,
      h: r.height,
    };
    const boxEl = document.createElement("div"); // 캡처 영역을 잠깐 보여주는 박스(영상이라 캡처 후 제거됨)
    boxEl.className = "ca-rect";
    Object.assign(boxEl.style, {
      left: fullBox.x + "px",
      top: fullBox.y + "px",
      width: fullBox.w + "px",
      height: fullBox.h + "px",
    });
    document.documentElement.appendChild(boxEl);
    commitRectCapture(fullBox, boxEl);
  }

  // F4 단축키용 대상 선택: 마우스 밑 영상 우선, 없으면 화면(뷰포트)에서 가장 넓게 보이는 영상.
  function pickVideoForShortcut() {
    if (lastMouse) {
      const under = videoUnderPoint(lastMouse.x, lastMouse.y);
      if (under) return under.v;
    }
    let best = null;
    let bestArea = 0;
    for (const v of document.querySelectorAll("video")) {
      const r = v.getBoundingClientRect();
      const vw = Math.min(r.right, window.innerWidth) - Math.max(r.left, 0); // 뷰포트와 겹치는 가로
      const vh = Math.min(r.bottom, window.innerHeight) - Math.max(r.top, 0); // 겹치는 세로
      if (vw <= 0 || vh <= 0) continue; // 화면 밖 영상 제외
      const area = vw * vh;
      if (area > bestArea) {
        bestArea = area;
        best = v;
      }
    }
    return best;
  }

  function updateMagnet(e) {
    if (mode !== "rect" || dragEl) return hideMagnet();
    if (captureBtnDragging) return; // 버튼 드래그 중엔 상태 유지(숨기지 않음)
    if (isUI(e.target)) {
      // 📷 버튼 위 → 캡처될 영역(영상 점선)을 표시. 그 외 우리 UI 위면 전체 숨김.
      if (captureBtn && captureBtn.contains(e.target) && magnetVideo) {
        showMagnetOutline(magnetVideo.v.getBoundingClientRect());
        return;
      }
      return hideMagnet();
    }
    // 영상 위(버튼 아님) → 버튼만 노출하고 점선은 숨김(버튼에 올려야 점선이 뜸).
    const vid = videoUnderPoint(e.clientX, e.clientY);
    if (!vid) return hideMagnet();
    magnetVideo = vid;
    removeMagnetOutline();
    ensureCaptureBtn();
    captureBtn.style.display = "flex";
    positionCaptureBtn(vid.v.getBoundingClientRect());
  }

  // 영상 캡처 피드백 — 캡처한 영역(box, 페이지 좌표)에 흰 셔터 플래시(카메라 '찰칵')를 잠깐 띄웠다
  // 자동 제거. 스크린샷에 흰빛이 박히지 않도록 캡처가 '끝난 뒤'에 호출한다.
  function shutterFlash(box) {
    const fx = document.createElement("div");
    fx.className = "ca-shutter";
    Object.assign(fx.style, {
      left: box.x + "px",
      top: box.y + "px",
      width: box.w + "px",
      height: box.h + "px",
    });
    document.documentElement.appendChild(fx);
    fx.addEventListener("animationend", () => fx.remove());
    setTimeout(() => fx.remove(), 600); // 애니메이션 미발화 대비 안전망
  }

  // 화면 하단 토스트 — 패널을 최소화해 단축키만 쓸 때도 캡처 성공/실패를 인지하게.
  let toastEl = null;
  let toastTimer = null;
  function showToast(text, isError) {
    if (toastEl) toastEl.remove();
    toastEl = document.createElement("div");
    toastEl.className = "ca-toast" + (isError ? " ca-toast-err" : "");
    toastEl.textContent = text;
    document.documentElement.appendChild(toastEl);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      if (toastEl) toastEl.remove();
      toastEl = null;
    }, 1600);
  }

  // 그린(또는 자석으로 만든) box 를 주석으로 추가하고 즉시 캡처한다. 드래그·영상클릭 양쪽에서 재사용.
  // boxEl: 비영상 캡처 때 페이지에 남길 빨강 박스(영상은 캡처 후 제거).
  function commitRectCapture(box, boxEl) {
    const id = uid();
    const vid = videoUnder(box); // 영상 위면 시간축 캡처로 전환
    const ann = { type: "rect", id, rect: box, image: null };
    if (vid) {
      // 영상 캡처: 타임스탬프 기록, page-Y 대신 영상 문서-Y로 묶고 시간순 정렬. 박스는 안 남김.
      ann.videoTime = vid.v.currentTime || 0;
      ann.videoIdx = vid.idx;
      // 같은 영상의 캡처는 첫 캡처의 Y를 재사용 → 스크롤·미니플레이어로 위치가 변해도 한 묶음 유지.
      const prior = annotations.find(
        (a) => a.type === "rect" && a.videoIdx === vid.idx && a.videoTop != null
      );
      ann.videoTop = prior ? prior.videoTop : vid.v.getBoundingClientRect().top + window.scrollY;
    } else {
      boxEl.dataset.caId = id; // 기사·논문: 박스를 페이지에 유지(형광펜 삭제 연동용)
    }
    annotations.push(ann);
    refreshAnnotationsPanel(); // 네모 추가 즉시 반영(이미지는 캡처 후 한 번 더)
    revealOnFirstAnnotation();
    scrollPanelTo(id); // 방금 추가한 항목으로 패널 스크롤(확인 + 바로 캡션 입력)
    // 그린 영역을 즉시(조용히) 캡처해 주석에 저장 (저장 버튼/AI에서 재사용)
    captureRegion(box)
      .then((dataUrl) => {
        ann.image = dataUrl;
        if (vid) {
          boxEl.remove(); // 영상: 캡처 끝나면 박스 제거(시청 방해·다음 캡처 혼동 방지)
          shutterFlash(box); // 스크린샷이 끝난 지금 '찰칵' 플래시(캡처 이미지엔 안 박힘)
          showToast("📷 캡처됨"); // 박스가 사라지므로 토스트로 성공을 확인(패널 최소화 대응)
        }
        refreshAnnotationsPanel();
        scrollPanelTo(id); // 이미지·캡션칸이 생긴 뒤 다시 스크롤(캡션이 보이도록)
      })
      .catch((err) => {
        if (vid) boxEl.remove();
        showToast("캡처 실패", true);
        console.warn("[주석] 캡처 실패:", err);
      });
  }

  // 뷰포트 좌표 (cx,cy) 가 어떤 <video> 위에 있으면 그 영상과 인덱스를 돌려준다(없으면 null).
  function videoUnderPoint(cx, cy) {
    const vids = Array.from(document.querySelectorAll("video"));
    for (let i = 0; i < vids.length; i++) {
      const r = vids[i].getBoundingClientRect();
      if (r.width && cx >= r.left && cx <= r.right && cy >= r.top && cy <= r.bottom)
        return { v: vids[i], idx: i };
    }
    return null;
  }
  // 박스 중심이 <video> 위에 있으면 그 영상과 인덱스를 돌려준다(없으면 null). 페이지좌표→뷰포트좌표 변환.
  function videoUnder(box) {
    return videoUnderPoint(box.x - window.scrollX + box.w / 2, box.y - window.scrollY + box.h / 2);
  }

  // 초 → mm:ss (1시간 이상이면 h:mm:ss)
  function fmtTime(s) {
    s = Math.max(0, Math.floor(s || 0));
    const h = Math.floor(s / 3600),
      m = Math.floor((s % 3600) / 60),
      sec = s % 60;
    const mm = h ? String(m).padStart(2, "0") : String(m);
    return (h ? h + ":" : "") + mm + ":" + String(sec).padStart(2, "0");
  }

  function drawRect(e) {
    const b = boxOf(e);
    Object.assign(dragEl.style, {
      left: b.x + "px",
      top: b.y + "px",
      width: b.w + "px",
      height: b.h + "px",
    });
  }

  // 캡처 직전 우리 오버레이(자석 점선·📷 버튼)를 잠깐 숨긴다 → captureVisibleTab(실제 스크린샷)에
  // 박히지 않게. 빨간 캡처 박스(.ca-rect)는 기존대로 테두리만 crop 하므로 숨기지 않는다.
  function setCaptureOverlaysHidden(hidden) {
    const v = hidden ? "hidden" : "";
    if (magnetEl) magnetEl.style.visibility = v;
    if (captureBtn && captureBtn.style.display !== "none") captureBtn.style.visibility = v;
  }

  // 화면을 찍어(captureVisibleTab) box 안쪽만 잘라 PNG dataURL 로 돌려준다.
  // box 자기 테두리(BORDER px)만큼 안쪽을 잘라 빨간 테두리를 제외하고, 자석·📷 오버레이는 숨긴 뒤 찍는다.
  const BORDER = 2; // .ca-rect 테두리 두께(px)와 일치
  function captureRegion(box) {
    return new Promise((resolve, reject) => {
      setCaptureOverlaysHidden(true);
      const done = (cb) => (arg) => {
        setCaptureOverlaysHidden(false);
        cb(arg);
      };
      const ok = done(resolve);
      const fail = done(reject);
      // 숨김이 화면에 반영(리페인트)되도록 2프레임 기다린 뒤 캡처 요청.
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          const sx = window.scrollX;
          const sy = window.scrollY;
          chrome.runtime.sendMessage({ type: "capture" }, (resp) => {
            if (chrome.runtime.lastError) return fail(chrome.runtime.lastError);
            if (!resp || resp.error || !resp.dataUrl)
              return fail(new Error((resp && resp.error) || "no data"));
            const img = new Image();
            img.onload = () => {
              const dpr = window.devicePixelRatio || 1;
              const cx = box.x + BORDER;
              const cy = box.y + BORDER;
              const cw = Math.max(1, box.w - BORDER * 2);
              const ch = Math.max(1, box.h - BORDER * 2);
              const canvas = document.createElement("canvas");
              canvas.width = Math.round(cw * dpr);
              canvas.height = Math.round(ch * dpr);
              canvas
                .getContext("2d")
                .drawImage(
                  img,
                  (cx - sx) * dpr,
                  (cy - sy) * dpr,
                  cw * dpr,
                  ch * dpr,
                  0,
                  0,
                  canvas.width,
                  canvas.height
                );
              ok(canvas.toDataURL("image/png"));
            };
            img.onerror = () => fail(new Error("image load fail"));
            img.src = resp.dataUrl;
          });
        })
      );
    });
  }

  // ---------- hover 미니 툴바 (저장/삭제) ----------
  // 형광펜/네모에 마우스를 올리면 그 우상단에 툴바가 떠서, 클릭으로 저장·삭제.
  let toolsTarget = null;
  let hideTimer = null;

  function placeTools(el) {
    const r = el.getBoundingClientRect();
    tools.style.left = r.right - tools.offsetWidth + 4 + "px";
    tools.style.top = r.top - 12 + "px";
  }
  function showToolsFor(el) {
    toolsTarget = el;
    const isRect = el.classList.contains("ca-rect");
    btnCopyImg.style.display = isRect ? "" : "none"; // 이미지 복사는 네모만
    btnCopyTxt.style.display = isRect ? "none" : ""; // 문장 복사는 형광펜만
    tools.style.display = "flex"; // 🤖 질문은 형광펜·네모 둘 다 제공
    placeTools(el);
    clearTimeout(hideTimer);
  }
  function scheduleHide() {
    hideTimer = setTimeout(() => {
      tools.style.display = "none";
      toolsTarget = null;
    }, 250);
  }

  // 영상 캡처용 임시 박스(.ca-rect, data-ca-id 없음)는 제외 — 캡처 후 제거되면서
  // 미니툴바가 고아로 남는 문제 방지. 영구 박스(비영상)와 형광펜만 대상.
  const HOVER_SEL = "." + HL + ", .ca-rect[data-ca-id]";
  document.addEventListener("mouseover", (e) => {
    if (dragEl) return; // 네모를 그리는 중에는 툴바를 띄우지 않음
    const el = e.target.closest(HOVER_SEL);
    if (el) showToolsFor(el);
  });
  document.addEventListener("mouseout", (e) => {
    if (e.target.closest(HOVER_SEL)) scheduleHide();
  });
  tools.addEventListener("mouseenter", () => clearTimeout(hideTimer));
  tools.addEventListener("mouseleave", scheduleHide);

  // 스크롤로 주석이 움직이면 툴바도 따라가 우상단에 붙어있게 재배치
  // (툴바는 position:fixed 라 한 번만 잡으면 스크롤 시 박스에서 밀려 보임)
  window.addEventListener(
    "scroll",
    () => {
      if (toolsTarget && tools.style.display !== "none") placeTools(toolsTarget);
    },
    true
  );
  btnDel.addEventListener("click", () => {
    if (!toolsTarget) return;
    if (toolsTarget.classList.contains(HL)) removeHighlight(toolsTarget);
    else removeAnnotation(toolsTarget);
    tools.style.display = "none";
    toolsTarget = null;
  });
  // 복사 성공 시 버튼을 잠깐 ✅ 로 바꿔 피드백.
  function flashCopied(btnEl) {
    if (!btnEl) return;
    const prev = btnEl.textContent;
    btnEl.textContent = "✅";
    setTimeout(() => (btnEl.textContent = prev), 900);
  }
  // 텍스트(형광펜 문장·노트) 복사 — hover 미니툴바와 정리 패널이 공유. btnEl 에 ✅ 피드백.
  function copyAnnotationText(ann, btnEl, fallbackText) {
    const txt = (ann && ann.text) || fallbackText || "";
    if (!txt) return;
    navigator.clipboard
      .writeText(txt)
      .then(() => flashCopied(btnEl))
      .catch(() => {});
  }
  // 캡처를 실제 PNG(image/png)로 클립보드에 — data-URI HTML 과 달리 Notion·한글에도 붙는다. 양쪽 공유.
  async function copyAnnotationImage(ann, btnEl) {
    if (!ann || !ann.image) return alert("이미지가 아직 캡처되지 않았습니다.");
    try {
      const blob = await (await fetch(ann.image)).blob();
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      flashCopied(btnEl);
    } catch (e) {
      alert("이미지 복사 실패: " + e.message);
    }
  }
  // 형광펜 문장(hover 한 span)을 텍스트로 복사
  btnCopyTxt.addEventListener("click", () => {
    if (!toolsTarget) return;
    copyAnnotationText(
      annotations.find((a) => a.id === toolsTarget.dataset.caId),
      btnCopyTxt,
      toolsTarget.textContent
    );
  });
  // 네모 캡처를 PNG 로 클립보드에 복사
  btnCopyImg.addEventListener("click", () => {
    if (!toolsTarget) return;
    copyAnnotationImage(annotations.find((a) => a.id === toolsTarget.dataset.caId), btnCopyImg);
  });
  // hover 미니툴바 🤖 — 떠 있는 주석(형광펜/네모)을 대상으로 질문. 실로직은 askAnnotation 공유.
  btnAsk.addEventListener("click", () => {
    if (!toolsTarget) return;
    askAnnotation(annotations.find((a) => a.id === toolsTarget.dataset.caId));
  });

  // 활성 프로바이더(게이트웨이/Gemini)에 맞는 선택 모델. 비전은 호출부에서 gemini-2.5-flash 로 별도 고정.
  async function getActiveModel() {
    const { ai_provider, gw_model, gemini_model } = await chrome.storage.local.get([
      "ai_provider",
      "gw_model",
      "gemini_model",
    ]);
    return (ai_provider === "gemini" ? gemini_model : gw_model) || "gemini-2.5-flash";
  }

  // 주석 1건을 AI에 질문 — hover 미니툴바와 정리 패널(영상캡처·노트·오프스크린 네모) 양쪽이 공유.
  async function askAnnotation(ann) {
    if (!ann) return;
    const isRect = ann.type === "rect";
    if (isRect && !ann.image) return alert("이미지가 아직 캡처되지 않았습니다.");
    const isNote = ann.type === "note";
    if (isNote && !(ann.text && ann.text.trim())) return alert("노트가 비어 있습니다.");

    const title = isRect ? "이미지 질문" : "텍스트 질문";
    const q = prompt(
      isRect
        ? "이 이미지에 대해 무엇을 물어볼까요?"
        : isNote
        ? "이 노트에 대해 무엇을 물어볼까요?"
        : "이 문장에 대해 무엇을 물어볼까요?",
      isRect
        ? "이 이미지를 설명해줘."
        : isNote
        ? "이 노트 내용을 쉽게 풀어줘."
        : "이 문장을 쉽게 설명해줘."
    );
    if (!q) return;

    // 답변 방식(텍스트·이미지 공통) — 짧게 끊지 말고 깊이 있게. 사용자가 줄쳐가며 읽는 용도.
    const style =
      "[답변 방식]\n" +
      "- 먼저 핵심 요약(또는 한두 줄 결론)을 제시한 뒤, 마크다운(제목/굵게/번호·불릿)으로 구조화해 충분히 상세하게 설명하라.\n" +
      "- 어려운 용어·개념에는 일상적인 비유를 함께 들어 이해를 돕는다.\n" +
      "- 배경, 구체적 수치·연도·사례, 흔한 오해 짚기 등을 곁들여 풍부하게 답하라(빈약한 한두 문장으로 끝내지 말 것).\n" +
      "- **너의 전체 지식을 총동원해 포괄적으로 답하라. 주어진 페이지/이미지에 적힌 내용만으로 스스로를 제한하지 마라.** " +
      "네가 아는 구체적 사실을 적극 제시하고, 기억이 불확실한 세부 수치는 '대략'·'추정' 등으로 표시하되 통째로 생략하거나 '확인이 필요하다'며 회피하지 마라.\n" +
      "- '강조 문장에 따르면', '제 지식을 활용하면' 같은 출처 구분·군더더기 머리말 없이 본론 위주로.\n";

    let content;
    let model;
    if (isRect) {
      model = "gemini-2.5-flash"; // 비전 필요
      content = [
        {
          type: "text",
          text:
            "사용자가 웹페이지에서 캡처한 아래 이미지에 대해 질문한다.\n" + style + "\n[질문] " + q,
        },
        { type: "image_url", image_url: { url: ann.image } },
      ];
    } else {
      model = await getActiveModel();
      const pageText = (document.body.innerText || "").slice(0, 6000);
      const intro = isNote
        ? "사용자가 웹페이지를 읽다가 직접 작성한 노트 메모에 대해 질문한다. "
        : "사용자가 웹페이지를 읽다가 일부를 강조하고 질문한다. ";
      const label = isNote ? "사용자가 작성한 노트" : "사용자가 강조한 부분";
      content =
        intro +
        "아래 페이지 정보는 '사용자가 무엇을 보고 무엇을 묻는지' 파악하기 위한 맥락일 뿐이며, " +
        "답은 페이지 안에 한정하지 말고 너의 전체 지식으로 포괄적으로 작성하라.\n" +
        style +
        "\n[페이지 제목] " + document.title + "\n" +
        "[URL] " + location.href + "\n" +
        "[" + label + '] "' + ann.text + '"\n\n' +
        "[참고용 페이지 본문]\n" + pageText + "\n\n" +
        "[질문] " + q;
    }
    showPanel(title, "질문 중…", false);
    chrome.runtime.sendMessage(
      {
        type: "gw-chat",
        body: { model, messages: [{ role: "user", content }] },
      },
      (resp) => {
        if (chrome.runtime.lastError) return showPanel(title, "오류: " + chrome.runtime.lastError.message, false);
        if (resp && resp.ok) showPanel(title, resp.reply, true, "qa");
        else showPanel(title, "실패: " + ((resp && resp.error) || "알 수 없음"), false);
      }
    );
  }

  function removeHighlight(span) {
    dropAnnotation(span.dataset.caId); // DOM 제거 전에: 노트 승계 순서 계산이 span 위치를 읽을 수 있게
    const parent = span.parentNode;
    while (span.firstChild) parent.insertBefore(span.firstChild, span);
    parent.removeChild(span);
    parent.normalize();
    refreshAnnotationsPanel();
  }

  function removeAnnotation(el) {
    dropAnnotation(el.dataset.caId);
    el.remove();
    refreshAnnotationsPanel();
  }

  // id 로 주석 삭제 — 패널 항목 ✕ 에서 호출. DOM(형광펜 span/네모 el)도 함께 정리.
  function deleteAnnotationById(id) {
    const ann = annotations.find((a) => a.id === id);
    if (!ann) return;
    if (ann.type === "highlight") {
      const span = document.querySelector("." + HL + '[data-ca-id="' + id + '"]');
      if (span) return removeHighlight(span);
    } else {
      const el = document.querySelector('.ca-rect[data-ca-id="' + id + '"]');
      if (el) return removeAnnotation(el);
    }
    dropAnnotation(id); // DOM 요소를 못 찾는 예외 상황: 배열에서만 제거
    refreshAnnotationsPanel();
  }

  function dropAnnotation(id) {
    // 삭제될 항목을 앵커로 삼던 노트는 '위쪽 가장 가까운 형광펜/네모'로 승계시켜 제자리를 지킨다(고아 방지).
    const order = collectSorted();
    const pos = order.findIndex((a) => a.id === id);
    let newAnchor = null;
    for (let k = pos - 1; k >= 0; k--) {
      if (order[k].type !== "note") {
        newAnchor = order[k].id;
        break;
      }
    }
    const i = annotations.findIndex((a) => a.id === id);
    if (i < 0) return;
    annotations.splice(i, 1);
    annotations.forEach((a) => {
      if (a.type === "note" && a.afterId === id) a.afterId = newAnchor;
    });
  }

  // 페이지의 형광펜·네모 주석을 한 번에 제거(확인 1회). 요약 패널·캐시는 건드리지 않는다.
  // (드래그가 여러 문단으로 번져 형광펜이 N개로 쪼개졌을 때 하나씩 지우는 수고 방지)
  function clearAllAnnotations() {
    if (!annotations.length) return alert("지울 주석이 없습니다.");
    if (!confirm("이 페이지의 형광펜·네모 주석을 모두 지울까요?")) return;
    document.querySelectorAll("." + HL).forEach((span) => {
      const parent = span.parentNode;
      if (!parent) return;
      while (span.firstChild) parent.insertBefore(span.firstChild, span);
      parent.removeChild(span);
      parent.normalize();
    });
    document.querySelectorAll(".ca-rect[data-ca-id]").forEach((el) => el.remove());
    annotations.length = 0;
    tools.style.display = "none"; // 떠 있던 hover 미니툴바 닫기
    toolsTarget = null;
    refreshAnnotationsPanel();
  }

  // ---------- 내보내기 ----------
  // 주석을 문서 위→아래 순서로 정렬 (형광펜=화면 위치, 네모=캡처 당시 y)
  // 형광펜·네모는 페이지 Y 좌표순. 노트(직접 입력)는 페이지 위치가 없으므로 afterId(= 가장 가까운 윗
  // 형광펜/네모 id, 없으면 null)로 그 뒤에 매단다. 같은 앵커의 노트끼리는 annotations 배열 순서를 따른다
  // (삽입·▲▼ 재배치가 이 순서를 바꾼다). 노트는 노트에 매달지 않음 → 재배치가 단순·견고.
  function collectSorted() {
    const notes = annotations.filter((a) => a.type === "note");
    const positioned = annotations
      .filter((a) => a.type !== "note")
      .map((a) => {
        // 영상 캡처는 영상의 문서-Y로 묶고(같은 영상끼리 모임), 2차 키 t(영상 시간)로 시간순 정렬.
        let y = a.type === "rect" ? (a.videoTop != null ? a.videoTop : a.rect.y) : 0;
        if (a.type === "highlight") {
          const el = document.querySelector("." + HL + '[data-ca-id="' + a.id + '"]');
          if (el) y = el.getBoundingClientRect().top + window.scrollY;
        }
        return { ann: a, y, t: a.videoTime != null ? a.videoTime : 0 };
      })
      .sort((p, q) => p.y - q.y || p.t - q.t)
      .map((x) => x.ann);
    const out = [];
    const placed = new Set();
    const pushNotes = (anchorId) =>
      notes.forEach((n) => {
        if ((n.afterId || null) === anchorId) {
          out.push(n);
          placed.add(n.id);
        }
      });
    pushNotes(null); // 최상단(앵커 없는) 노트
    for (const a of positioned) {
      out.push(a);
      pushNotes(a.id);
    }
    notes.forEach((n) => placed.has(n.id) || out.push(n)); // 앵커가 사라진 고아 노트는 끝에
    return out;
  }

  function buildHTML(items) {
    const esc = (s) =>
      String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
    const body = items
      .map((it) =>
        it.type === "highlight"
          ? "<blockquote>" + esc(it.text) + "</blockquote>"
          : it.type === "note"
          ? '<p class="note">' + esc(it.text) + "</p>"
          : it.image
          ? (function () {
              const cap =
                (it.videoTime != null ? "[" + fmtTime(it.videoTime) + "] " : "") + (it.caption || "");
              return (
                '<figure><img src="' + it.image + '">' +
                (cap.trim() ? "<figcaption>" + esc(cap) + "</figcaption>" : "") +
                "</figure>"
              );
            })()
          : ""
      )
      .join("\n");
    return (
      '<!doctype html><html><head><meta charset="utf-8"><title>' +
      esc(document.title) +
      "</title><style>" +
      ".ca-toolbar,.ca-tools,.ca-menu,.ca-panel{display:none!important}" + // 확장 UI가 내보내기 문서에 안 보이게
      'body{font-family:-apple-system,"Malgun Gothic",sans-serif;max-width:760px;' +
      "margin:32px auto;padding:0 16px;color:#222;line-height:1.6}" +
      "h1{font-size:20px}.src{color:#888;font-size:12px;margin-bottom:24px;word-break:break-all}" +
      "blockquote{border-left:4px solid #ff7f50;background:#fff5f0;margin:12px 0;" +
      "padding:8px 14px;border-radius:4px}" +
      "figure{margin:16px 0}img{max-width:100%;border:1px solid #ddd;border-radius:4px}" +
      "figcaption{color:#666;font-size:13px;margin-top:4px}" +
      "p.note{margin:10px 0;color:#333;white-space:pre-wrap}" +
      "</style></head><body><h1>" +
      esc(document.title) +
      '</h1><div class="src">' +
      esc(location.href) +
      " · " +
      esc(new Date().toLocaleString()) +
      "</div>" +
      body +
      "</body></html>"
    );
  }

  // 주석 정리 탭 본문 렌더 — 텍스트 인용문 + 네모 캡처를 문서 순서대로. (실시간 갱신에 재사용)
  // blockquote/figure 같은 시맨틱 태그는 사이트(특히 다크 테마) CSS 가 타고 들어와 색을 덮으므로
  // div + 명시 색상(!important)으로 렌더 — 패널은 페이지 DOM 에 주입돼 사이트 CSS 영향을 받는다.
  function renderAnnotationsBody() {
    const items = collectSorted();
    const esc = (s) =>
      String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
    if (!items.length) {
      panelBody.innerHTML =
        '<div style="color:#888;padding:4px;font-size:13px">아직 주석이 없습니다. 형광펜이나 네모를 추가하면 여기에 실시간으로 정리됩니다.</div>';
      return;
    }
    // 항목 사이/양끝의 노트 삽입 자리(+). data-after = 바로 위 항목 id("" = 최상단)
    const gap = (afterId) =>
      '<div class="ca-note-gap"><button class="ca-note-add" data-after="' + afterId +
      '" title="여기에 노트 추가">+ 노트</button></div>';
    panelBody.innerHTML =
      gap("") +
      items
        .map((it, i) => {
          const del =
            '<button class="ca-anno-del" data-ca-del="' + it.id + '" title="이 주석 삭제">✕</button>';
          // 🤖 질문 — 영상캡처·오프스크린 네모·노트는 페이지에 hover 대상이 없어 여기서 입구를 연다.
          // (떠 있는 형광펜·네모의 hover 미니툴바 🤖는 그대로 유지.)
          // 노트는 항상 🤖를 단다 — 노트 편집은 재렌더가 없어(포커스 유지), text.trim() 조건으로 걸면
          // 방금 입력한 노트에 🤖가 안 나타난다. 빈 노트 가드는 askAnnotation 에서 처리.
          const canAi =
            it.type === "highlight" || (it.type === "rect" && it.image) || it.type === "note";
          const ai = canAi
            ? '<button class="ca-anno-ai" data-ca-ai="' + it.id + '" title="이 주석에 AI로 질문">🤖</button>'
            : "";
          // 복사 — 캡처는 🖼(PNG), 형광펜·노트는 📋(텍스트). hover 미니툴바의 복사를 패널로도 미러링.
          const copy = !canAi
            ? ""
            : it.type === "rect"
            ? '<button class="ca-anno-copy" data-ca-copy="' + it.id +
              '" data-kind="img" title="이 캡처를 이미지로 복사 (Notion·한글·Word)">🖼</button>'
            : '<button class="ca-anno-copy" data-ca-copy="' + it.id +
              '" data-kind="txt" title="이 텍스트를 복사">📋</button>';
          let inner;
          if (it.type === "highlight") {
            inner =
              '<div style="border-left:3px solid #ff7f50;background:#fff5f0!important;color:#222!important;' +
              'margin:8px 0;padding:6px 72px 6px 10px;border-radius:4px">' + esc(it.text) + "</div>";
          } else if (it.type === "note") {
            inner =
              '<div class="ca-note" data-note-edit="' + it.id +
              '" contenteditable="true" data-ph="노트를 입력하세요…">' + esc(it.text) + "</div>" +
              '<div class="ca-note-mv-wrap">' +
              '<button class="ca-note-mv" data-note-move="' + it.id + '" data-dir="-1" title="위로">▲</button>' +
              '<button class="ca-note-mv" data-note-move="' + it.id + '" data-dir="1" title="아래로">▼</button>' +
              "</div>";
          } else if (it.image) {
            // 영상 캡처면 타임스탬프 배지(클릭→그 장면으로 점프)를 이미지 위에 단다.
            const ts =
              it.videoTime != null
                ? '<button class="ca-ts" data-seek="' + (it.videoIdx || 0) + '" data-t="' +
                  it.videoTime + '" title="이 장면으로 이동">▶ ' + esc(fmtTime(it.videoTime)) +
                  "</button>"
                : "";
            inner =
              '<div style="margin:10px 0">' + ts + '<img src="' + it.image +
              '" style="max-width:100%;border:1px solid #ddd;border-radius:4px">' +
              '<div class="ca-cap" data-cap-edit="' + it.id +
              '" contenteditable="true" data-ph="캡션 입력(노션에 사진 아래로 저장)…">' +
              esc(it.caption || "") + "</div></div>";
          } else {
            inner = '<div style="color:#888;margin:8px 0;font-size:13px">[네모 캡처 중…]</div>';
          }
          // 마지막 항목 뒤 gap 은 하단 상시 입력창과 중복이라 생략(상단·항목사이 삽입용 gap 만 유지).
          const after = i < items.length - 1 ? gap(it.id) : "";
          return '<div class="ca-anno-item">' + inner + ai + copy + del + "</div>" + after;
        })
        .join("");
  }

  // 삽입 위치 바로 위 항목(aboveId) 기준 앵커 계산 — 노트면 그 노트의 앵커를, 형광펜/네모면 자신을.
  function anchorFor(aboveId) {
    if (!aboveId) return null;
    const a = annotations.find((x) => x.id === aboveId);
    if (!a) return null;
    return a.type === "note" ? a.afterId || null : a.id;
  }

  // 노트 삽입 — 바로 위 항목(aboveId, "" = 최상단) 뒤에 빈 노트를 만들고 그 자리로 포커스.
  function insertNoteAfter(aboveId) {
    const id = uid();
    const idx = aboveId ? annotations.findIndex((a) => a.id === aboveId) : -1;
    annotations.splice(idx + 1, 0, { type: "note", id, text: "", afterId: anchorFor(aboveId) });
    renderAnnotationsBody();
    const el = panelBody.querySelector('[data-note-edit="' + id + '"]');
    if (el) el.focus();
  }

  // 하단 입력창에서 Enter 로 호출 — 맨 끝(마지막 표시 항목 뒤)에 노트를 추가. 포커스는 입력창에 유지.
  function addNoteAtEnd(text) {
    const order = collectSorted();
    const lastId = order.length ? order[order.length - 1].id : "";
    const idx = lastId ? annotations.findIndex((a) => a.id === lastId) : -1;
    const id = uid();
    annotations.splice(idx + 1, 0, { type: "note", id, text, afterId: anchorFor(lastId) });
    renderAnnotationsBody();
    scrollPanelTo(id); // 방금 추가한 노트로 스크롤(입력창 포커스는 유지)
  }

  // 주석 정리 패널을 특정 항목(id)으로 스크롤 — 캡션칸 우선(바로 입력), 없으면 항목 전체.
  // scrollIntoView 는 문서 루트까지 스크롤할 수 있어(유튜브 페이지 점프 위험) panelBody 만 좌표로 직접 스크롤.
  function scrollPanelTo(id) {
    if (panel.style.display === "none" || panelKind !== "annotations") return;
    const del = panelBody.querySelector('[data-ca-del="' + id + '"]');
    const item = del && del.closest(".ca-anno-item");
    if (!item) return;
    const doScroll = () => {
      const target = item.querySelector("[data-cap-edit]") || item; // 캡션칸 우선(바로 입력)
      const ir = target.getBoundingClientRect();
      const pr = panelBody.getBoundingClientRect();
      if (ir.bottom > pr.bottom) panelBody.scrollTop += ir.bottom - pr.bottom + 8;
      else if (ir.top < pr.top) panelBody.scrollTop -= pr.top - ir.top + 8;
    };
    doScroll();
    // 캡처 이미지가 아직 디코드 전이면 높이가 0이라 덜 내려감 → 로드되면(높이 확정) 한 번 더.
    const img = item.querySelector("img");
    if (img && !img.complete) img.addEventListener("load", doScroll, { once: true });
  }

  // 노트 한 칸 이동(▲ dir=-1 / ▼ dir=+1). 표시 순서에서 이웃과 자리를 바꾼 뒤, 각 노트의 앵커를
  // '바로 위 형광펜/네모'로 다시 계산하고 annotations 를 그 순서로 재구성한다(형광펜/네모 상호순서는
  // collectSorted 가 Y 로 다시 잡으므로 무방 — 이동은 노트만 대상이라 위치주석끼리는 안 바뀜).
  function moveNote(id, dir) {
    const order = collectSorted();
    const i = order.findIndex((x) => x.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= order.length) return;
    [order[i], order[j]] = [order[j], order[i]];
    let lastPositioned = null;
    for (const it of order) {
      if (it.type === "note") it.afterId = lastPositioned;
      else lastPositioned = it.id;
    }
    annotations.length = 0;
    order.forEach((x) => annotations.push(x));
    renderAnnotationsBody();
  }

  // 주석 정리 탭 열기 — 주석이 없어도 빈 안내로 열린다.
  function showAnnotationsPanel() {
    panel.classList.remove("ca-min");
    minBtn.textContent = "▾";
    panel.querySelector(".ca-panel-title").textContent = "주석 정리";
    panelTitle = "주석 정리";
    panelIsMd = false;
    panelKind = "annotations";
    panelRaw = "";
    panelBody.style.whiteSpace = "normal";
    renderAnnotationsBody();
    panel.style.display = "flex";
    applyPanelPos();
    syncPanelChrome();
  }

  // 편집 중인 contenteditable 의 캐럿 위치(시작부터의 글자 수)를 구한다.
  function caretOffset(el) {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return 0;
    const r = sel.getRangeAt(0).cloneRange();
    const pre = document.createRange();
    pre.selectNodeContents(el);
    pre.setEnd(r.endContainer, r.endOffset);
    return pre.toString().length;
  }
  // 재렌더 후 같은 편집칸에 캐럿을 글자 수 기준으로 되돌린다.
  function setCaret(el, offset) {
    el.focus();
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let remain = offset,
      node = null,
      last = null,
      n;
    while ((n = walker.nextNode())) {
      last = n;
      if (n.textContent.length >= remain) {
        node = n;
        break;
      }
      remain -= n.textContent.length;
    }
    const r = document.createRange();
    if (node) r.setStart(node, remain);
    else if (last) r.setStart(last, last.textContent.length);
    else r.setStart(el, 0);
    r.collapse(true);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(r);
  }

  // 형광펜·네모가 추가/삭제/캡처될 때 주석 탭이 열려 있으면 즉시 다시 그린다(실시간 반영).
  // 노트·캡션을 편집 중이어도 갱신하되, 그 편집칸의 캐럿을 복원해 타이핑이 끊기지 않게 한다.
  function refreshAnnotationsPanel() {
    if (panel.style.display === "none" || panelKind !== "annotations") return;
    if (panelComposing) {
      panelRefreshPending = true; // IME 조합 중엔 보류 — compositionend 에서 다시 그림
      return;
    }
    const ae = document.activeElement;
    let keep = null;
    if (ae && ae.isContentEditable && panelBody.contains(ae)) {
      const id = ae.getAttribute("data-note-edit") || ae.getAttribute("data-cap-edit");
      if (id) keep = { id, offset: caretOffset(ae) };
    }
    renderAnnotationsBody();
    if (keep) {
      const el = panelBody.querySelector(
        '[data-note-edit="' + keep.id + '"],[data-cap-edit="' + keep.id + '"]'
      );
      if (el) setCaret(el, keep.offset);
    }
  }

  function exportPDF() {
    const items = collectSorted();
    if (!items.length) return alert("내보낼 주석이 없습니다.");
    const w = window.open("", "_blank");
    if (!w) return alert("팝업이 차단되었습니다. 이 사이트의 팝업을 허용해주세요.");
    w.document.write(buildHTML(items));
    w.document.close();
    w.focus();
    // 이미지(dataURL)가 다 그려진 뒤 인쇄창을 띄운다
    const imgs = w.document.images;
    if (!imgs.length) return w.print();
    let left = imgs.length;
    const go = () => --left <= 0 && w.print();
    Array.from(imgs).forEach((im) => {
      if (im.complete) go();
      else {
        im.onload = go;
        im.onerror = go;
      }
    });
  }

  // 요약 패널 내용을 색 포함 그대로 인쇄(PDF 저장)
  function exportSummaryPDF() {
    if (!panelIsMd || !panelBody.innerHTML.trim()) return alert("먼저 AI 요약을 실행하세요.");
    const w = window.open("", "_blank");
    if (!w) return alert("팝업이 차단되었습니다. 이 사이트의 팝업을 허용해주세요.");
    const css =
      // 새 창에도 콘텐츠 스크립트가 주입돼 툴바/패널이 보일 수 있으므로 숨김(buildHTML 과 동일)
      ".ca-toolbar,.ca-tools,.ca-menu,.ca-panel,.ca-modefx{display:none!important}" +
      "*{-webkit-print-color-adjust:exact;print-color-adjust:exact}" + // 인쇄에 배경색(코랄 등) 유지
      'body{font-family:-apple-system,"Malgun Gothic",sans-serif;max-width:720px;margin:32px auto;padding:0 16px;color:#222;line-height:1.6}' +
      "h1{font-size:18px}.src{color:#888;font-size:12px;margin-bottom:20px;word-break:break-all}" +
      ".ca-line{margin:3px 0}.ca-sec{margin-top:14px;font-weight:700;color:#1a5fb4}.ca-sec:first-child{margin-top:0}" +
      ".ca-md-h{font-weight:700;color:#1a5fb4;margin:12px 0 4px}" +
      ".ca-mk{font-weight:600}.ca-l1{color:#1a5fb4}.ca-l2{color:#1d7a6f}.ca-l3{color:#b45309}.ca-l4{color:#7c3aed}" +
      ".ca-anno-mark{background:rgba(255,127,80,.22);border-radius:3px;padding:0 3px}" +
      "code{color:#e2552e;background:rgba(226,85,46,.1);padding:1px 4px;border-radius:4px;font-family:Consolas,monospace}";
    w.document.write(
      '<!doctype html><html><head><meta charset="utf-8"><title>' +
        (document.title || "요약") +
        "</title><style>" +
        css +
        "</style></head><body><h1>요약 — " +
        document.title +
        '</h1><div class="src">' +
        location.href +
        "</div>" +
        panelBody.innerHTML +
        "</body></html>"
    );
    w.document.close();
    w.focus();
    w.print();
  }

  // ---------- AI 요약 (형광펜 + 네모 캡처 종합) ----------
  // force=true(🔄 버튼)면 캐시 무시하고 무조건 재호출. 평소 🤖/단축키는 캐시를 보여준다
  // (주석이 그대로면 재요약 안 함 — 바뀌었으면 제목에 '갱신 필요' 표시하고 🔄 유도).
  async function aiSummarize(force) {
    const items = collectSorted();
    const quotes = items.filter((it) => it.type === "highlight").map((it) => it.text);
    const rects = items.filter((it) => it.type === "rect" && it.image);
    // 주석 시그니처 — 네모는 캡처 이미지 길이로 변화 감지(저렴한 프록시)
    const sig = quotes.join("|") + "##" + rects.map((r) => (r.image || "").length).join(",");
    if (!force && summaryCache) {
      const stale = summaryCache.sig !== sig;
      showPanel(stale ? "요약 (주석 변경됨 — 🔄로 갱신)" : "요약", summaryCache.text, true, "summary");
      return;
    }
    const model = await getActiveModel();
    const pageText = (document.body.innerText || "").slice(0, 8000);
    const hl = quotes.length
      ? quotes.map((q, i) => "(" + (i + 1) + ") " + q).join("\n")
      : "(강조된 부분 없음)";
    const prompt =
      "아래 웹페이지를 한국어로 요약하라. 사용자가 형광펜으로 강조한 부분과 네모로 캡처한 이미지를 " +
      "가장 중요하게 다루고, 그 부분을 중심으로 핵심만 정리하라.\n" +
      "[출력 형식 규칙]\n" +
      "- 논문식 번호 아웃라인으로 계층을 표현하고, 각 하위 단계는 공백 4칸씩 더 들여쓴다:\n" +
      "    1단계: '1.' '2.'  (들여쓰기 0)\n" +
      "    2단계: '가.' '나.'  (들여쓰기 4칸)\n" +
      "    3단계: '1)' '2)'  (들여쓰기 8칸)\n" +
      "    4단계: '가)' '나)'  (들여쓰기 12칸)\n" +
      "- 불릿(-)은 순서가 의미 없는 단순 나열에만 제한적으로 사용.\n" +
      "- 개조식으로 작성. 문장 끝의 '~입니다/~합니다/~이다' 같은 종결어미를 제거하고 명사형으로 끝맺기. " +
      "(예: '요약하는 방법입니다' → '요약하는 방법')\n" +
      "- 사용자가 직접 강조(형광펜)하거나 캡처(네모)한 내용에서 나온 항목은 번호 바로 뒤, 내용 앞에 '★ ' 를 붙인다. " +
      "페이지 전체에서 보충한 내용은 마커 없이.\n" +
      "- 군더더기 머리말 없이 요점만.\n\n" +
      "[강조한 부분]\n" + hl + "\n\n" +
      (rects.length ? "[캡처 이미지] " + rects.length + "장 첨부됨 — 내용도 요약에 반영(이 항목들도 ★ 표시)\n\n" : "") +
      "[본문]\n" + pageText;
    const content = rects.length
      ? [{ type: "text", text: prompt }].concat(
          rects.map((r) => ({ type: "image_url", image_url: { url: r.image } }))
        )
      : prompt;
    showPanel("요약", "요약 중…", false, "summary");
    chrome.runtime.sendMessage(
      { type: "gw-chat", body: { model, messages: [{ role: "user", content }] } },
      (resp) => {
        if (chrome.runtime.lastError) return showPanel("요약", "오류: " + chrome.runtime.lastError.message, false);
        if (resp && resp.ok) {
          summaryCache = { sig, text: resp.reply };
          showPanel("요약", resp.reply, true, "summary");
        } else showPanel("요약", "실패: " + ((resp && resp.error) || "알 수 없음"), false);
      }
    );
  }

  // ---------- Notion 내보내기 (5단계) ----------
  // 요약 패널이 떠 있으면 그 아웃라인을 Notion 블록용 라인으로 수집(제목=heading, 나머지=들여쓰기 보존 문단).
  // 노션 API 의 중첩 깊이 제한을 피하려 중첩 리스트 대신 들여쓰기+마커를 살린 문단으로 보낸다.
  function collectSummaryForNotion() {
    if (!panelIsMd || !panelBody.querySelector(".ca-line")) return null;
    const out = [];
    panelBody.querySelectorAll(".ca-line").forEach((div) => {
      const text = serializeInline(div).trim();
      if (!text) return;
      if (div.classList.contains("ca-md-h")) out.push({ kind: "h2", text });
      else out.push({ kind: "p", text: " ".repeat(+(div.dataset.indent || 0)) + text });
    });
    return out.length ? out : null;
  }

  async function exportNotion() {
    const { notion_token, notion_parent_id } = await chrome.storage.local.get([
      "notion_token",
      "notion_parent_id",
    ]);
    if (!notion_token || !notion_parent_id) {
      return alert("Notion 토큰/부모 페이지가 설정되지 않았습니다. 확장 옵션에서 입력하세요.");
    }
    const sorted = collectSorted();
    const items = sorted
      .map((it) =>
        it.type === "highlight"
          ? { kind: "quote", text: it.text }
          : it.type === "note"
          ? { kind: "note", text: it.text }
          : it.image
          ? {
              kind: "image",
              dataUrl: it.image,
              // 영상 캡처면 캡션 앞에 [mm:ss] 를 붙여 노션 캡션에 시점 표시.
              caption:
                (it.videoTime != null ? "[" + fmtTime(it.videoTime) + "] " : "") + (it.caption || ""),
            }
          : null
      )
      .filter((it) => it && !(it.kind === "note" && !it.text.trim())); // 빈 노트 제외
    const hlCount = sorted.filter((it) => it.type === "highlight").length;
    const rectCount = sorted.filter((it) => it.type === "rect" && it.image).length;
    const summary = collectSummaryForNotion();
    if (!items.length && !summary) return alert("내보낼 주석이나 요약이 없습니다.");

    // 바로 저장하지 않고, 분류·요약을 고르는 패널을 먼저 띄운다(저장 후 Notion에서 분류 누르는 수고 제거).
    const base = {
      type: "notion-export",
      parentId: notion_parent_id,
      title: document.title || location.href,
      url: location.href,
      items,
      hlCount,
      rectCount,
    };
    showNotionDbStep(base, summary, notion_parent_id);
  }

  // 내보내기 1단계 — 어떤 인박스 DB 로 보낼지 고른다(평소엔 활성 DB가 미리 선택돼 그냥 통과).
  // 새 DB 만들기도 여기서. 목록 조회 실패 시 기존 자동 경로(분류 단계)로 폴백.
  // force=true 면 DB 가 1개여도 선택 화면을 건너뛰지 않는다(picker 의 'DB 변경·추가' 링크용).
  function showNotionDbStep(base, summary, parentId, force) {
    showPanel("Notion 내보내기", "DB 목록 불러오는 중…", false);
    chrome.runtime.sendMessage({ type: "notion-list-dbs", parentId }, (resp) => {
      if (chrome.runtime.lastError || !resp || !resp.ok) {
        const err = chrome.runtime.lastError
          ? chrome.runtime.lastError.message
          : (resp && resp.error) || "알 수 없음";
        console.warn("[주석] DB 목록 실패:", err);
        return showNotionPicker(base, summary, parentId); // 폴백: 활성/자동 DB로 분류 단계 진행
      }
      renderNotionDbStep(base, summary, parentId, resp.databases || [], resp.activeId, force);
    });
  }

  function renderNotionDbStep(base, summary, parentId, databases, activeId, force) {
    // DB 가 정확히 1개면 선택 단계를 건너뛰고 곧장 분류·저장 화면으로 — 백엔드가 그 단일 DB 를 자동 사용.
    // (force 면 건너뛰지 않음: picker 의 'DB 변경·추가' 링크로 돌아왔을 때 무한 루프 방지 + 새 DB 생성 경로 유지.)
    if (!force && databases.length === 1) return showNotionPicker(base, summary, parentId);

    panelBody.style.whiteSpace = "normal";
    panelBody.textContent = "";
    let chosen = activeId || (databases[0] && databases[0].id) || null;

    const label = document.createElement("div");
    label.textContent = "내보낼 DB 선택";
    label.style.cssText =
      "font-weight:600 !important;margin:2px 0 8px !important;color:#333 !important";
    panelBody.appendChild(label);

    const wrap = document.createElement("div");
    wrap.style.cssText = "display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px";
    const btns = [];
    const paint = () => btns.forEach((b) => (b.style.cssText = chipCss(b.dataset.id === chosen)));
    databases.forEach((d) => {
      const b = document.createElement("button");
      const when = d.created ? new Date(d.created).toLocaleDateString() : "";
      b.textContent = d.title + (when ? " (" + when + ")" : "");
      b.dataset.id = d.id;
      b.addEventListener("click", () => {
        chosen = d.id;
        paint();
      });
      btns.push(b);
      wrap.appendChild(b);
    });
    panelBody.appendChild(wrap);

    if (!databases.length) {
      const empty = document.createElement("div");
      empty.textContent = "아직 인박스 DB가 없습니다. 아래에서 새로 만들어 주세요.";
      empty.style.cssText = "color:#666;font-size:12px;margin-bottom:8px";
      panelBody.appendChild(empty);
    }

    // 새 DB 만들기 (선택적 라벨 — 같은 페이지의 다른 DB와 구분)
    const newRow = document.createElement("div");
    newRow.style.cssText = "display:flex;gap:6px;margin-bottom:12px";
    const labelInput = document.createElement("input");
    labelInput.type = "text";
    labelInput.placeholder = "새 DB 라벨(선택) 예: 맥북";
    labelInput.style.cssText =
      "flex:1 !important;box-sizing:border-box !important;padding:6px !important;border:1px solid #ccc !important;" +
      "border-radius:6px !important;background:#fff !important;color:#333 !important;font-size:13px !important;" +
      "outline:none !important;box-shadow:none !important";
    const newBtn = document.createElement("button");
    newBtn.textContent = "+ 새 DB";
    newBtn.style.cssText = chipCss(false);
    newBtn.addEventListener("click", () => {
      newBtn.disabled = true;
      newBtn.textContent = "생성 중…";
      chrome.runtime.sendMessage(
        { type: "notion-create-db", parentId, label: labelInput.value.trim() },
        (resp) => {
          if (chrome.runtime.lastError || !resp || !resp.ok) {
            newBtn.disabled = false;
            newBtn.textContent = "+ 새 DB";
            return alert(
              "새 DB 생성 실패: " +
                (chrome.runtime.lastError
                  ? chrome.runtime.lastError.message
                  : (resp && resp.error) || "알 수 없음")
            );
          }
          showNotionPicker(base, summary, parentId); // 생성 즉시 활성 지정됨 → 분류 단계로
        }
      );
    });
    newRow.appendChild(labelInput);
    newRow.appendChild(newBtn);
    panelBody.appendChild(newRow);

    const next = document.createElement("button");
    next.textContent = "다음 (분류 선택) →";
    next.style.cssText =
      "padding:7px 14px !important;background:#1a5fb4 !important;color:#fff !important;border:none !important;" +
      "border-radius:6px !important;font-weight:600 !important;cursor:pointer !important;font-size:13px !important;" +
      "outline:none !important;box-shadow:none !important";
    next.addEventListener("click", () => {
      if (!chosen) return alert("DB를 선택하거나 새로 만들어 주세요.");
      next.disabled = true;
      next.textContent = "확인 중…";
      chrome.runtime.sendMessage(
        { type: "notion-set-active-db", parentId, databaseId: chosen },
        (resp) => {
          if (chrome.runtime.lastError || !resp || !resp.ok) {
            next.disabled = false;
            next.textContent = "다음 (분류 선택) →";
            return alert(
              "DB 선택 실패: " +
                (chrome.runtime.lastError
                  ? chrome.runtime.lastError.message
                  : (resp && resp.error) || "알 수 없음")
            );
          }
          showNotionPicker(base, summary, parentId);
        }
      );
    });
    panelBody.appendChild(next);

    paint();
  }

  // 내보내기 직전 패널 — Notion DB의 '분류' select 옵션을 실시간 조회해 버튼으로 보여준다.
  function showNotionPicker(base, summary, parentId) {
    showPanel("Notion 내보내기", "분류 불러오는 중…", false);
    chrome.runtime.sendMessage({ type: "notion-categories", parentId }, (resp) => {
      const cats = (resp && resp.ok && resp.categories) || [];
      if (!cats.includes("미분류")) cats.unshift("미분류");
      const warn = chrome.runtime.lastError
        ? chrome.runtime.lastError.message
        : resp && !resp.ok
        ? resp.error
        : null;
      renderNotionPicker(base, summary, cats, warn, parentId);
    });
  }

  // 패널은 호스트 페이지 DOM 안이라 사이트 CSS(button:hover/:focus 등)가 새어든다.
  // 인라인 !important 로 못박아 어느 사이트에서도 선택 표시가 일관되게 보이도록 한다.
  function chipCss(active) {
    return (
      "padding:5px 12px !important;border-radius:14px !important;cursor:pointer !important;" +
      "font-size:13px !important;outline:none !important;box-shadow:none !important;" +
      "border:1px solid " + (active ? "#e3573f" : "#ccc") + " !important;" +
      "background:" + (active ? "#e3573f" : "#fff") + " !important;" +
      "color:" + (active ? "#fff" : "#333") + " !important;"
    );
  }

  function renderNotionPicker(base, summary, cats, warn, parentId) {
    panelBody.style.whiteSpace = "normal";
    panelBody.textContent = "";
    const chosen = new Set(); // 다중 선택 — 빈 집합이면 분류 없이 저장

    // DB 가 1개라 선택 단계를 건너뛴 경우에도 다른 DB 선택·새 DB 생성으로 돌아갈 수 있는 작은 링크.
    // 보조 동작이라 조용한 텍스트 링크로 두되, hover 밑줄로 클릭 가능함을 알리고 아래 구분선으로 본문과 분리.
    const back = document.createElement("button");
    // 화살표는 크게(볼드)해 또렷하게, 글자는 weight 600. flex+align-items:center 로 글리프 크기와
    // 무관하게 세로 중앙정렬(이전 vertical-align magic number 방식은 폰트마다 틀어져 폐기).
    back.innerHTML =
      '<span style="font-size:17px !important;font-weight:600 !important;line-height:1 !important">‹</span>' +
      '<span style="line-height:1 !important">DB 변경·추가</span>';
    back.style.cssText =
      "background:none !important;border:none !important;color:#666 !important;cursor:pointer !important;" +
      "font-size:13px !important;font-weight:500 !important;padding:2px 0 0 !important;margin:0 !important;outline:none !important;" +
      "box-shadow:none !important;display:inline-flex !important;align-items:center !important;gap:3px !important";
    back.style.setProperty("text-decoration", "none", "important");
    // 인라인 !important 와 싸우는 패널 구조라 :hover CSS 대신 JS 로 밑줄 토글.
    back.addEventListener("mouseenter", () =>
      back.style.setProperty("text-decoration", "underline", "important")
    );
    back.addEventListener("mouseleave", () =>
      back.style.setProperty("text-decoration", "none", "important")
    );
    back.addEventListener("click", () => showNotionDbStep(base, summary, parentId, true));
    panelBody.appendChild(back);

    const backDiv = document.createElement("div"); // 내비게이션과 본문(분류 선택) 구분선
    backDiv.style.cssText = "border-top:1px solid #eee !important;margin:6px 0 12px !important";
    panelBody.appendChild(backDiv);

    const label = document.createElement("div");
    label.textContent = "분류 선택 (여러 개 선택 가능)";
    label.style.cssText = "font-weight:600 !important;margin:2px 0 8px !important;color:#333 !important";
    panelBody.appendChild(label);

    const wrap = document.createElement("div");
    wrap.style.cssText = "display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px";
    const btns = [];
    const paint = () =>
      btns.forEach((b) => (b.style.cssText = chipCss(chosen.has(b.dataset.cat))));
    const addChip = (name) => {
      if (btns.some((b) => b.dataset.cat === name)) return; // 중복 칩 방지
      const b = document.createElement("button");
      b.textContent = name;
      b.dataset.cat = name;
      b.addEventListener("click", () => {
        if (chosen.has(name)) chosen.delete(name);
        else chosen.add(name);
        paint();
      });
      btns.push(b);
      wrap.appendChild(b);
    };
    cats.forEach(addChip);
    panelBody.appendChild(wrap);

    const custom = document.createElement("input");
    custom.type = "text";
    custom.placeholder = "새 분류 입력 후 Enter";
    custom.style.cssText =
      "width:100% !important;box-sizing:border-box !important;padding:6px !important;margin-bottom:10px !important;" +
      "border:1px solid #ccc !important;border-radius:6px !important;background:#fff !important;color:#333 !important;" +
      "font-size:13px !important;outline:none !important;box-shadow:none !important";
    // 입력칸 Enter 는 전역 swallowTypingKeys(캡처 단계)가 먼저 삼켜 이 요소의 keydown 까지 닿지 않으므로,
    // 그 핸들러가 호출할 제출 콜백을 등록한다(위 catComposer / catComposerSubmit).
    catComposer = custom;
    catComposerSubmit = () => {
      const name = custom.value.trim();
      if (!name) return;
      addChip(name); // 새 칩 생성(이미 있으면 무시)
      chosen.add(name); // 선택 상태로
      custom.value = "";
      paint();
    };
    panelBody.appendChild(custom);

    let includeSummary = true;
    if (summary && summary.length) {
      const row = document.createElement("label");
      row.style.cssText =
        "display:flex !important;align-items:center !important;gap:6px !important;margin-bottom:10px !important;cursor:pointer !important;color:#333 !important;font-size:13px !important";
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = true;
      cb.addEventListener("change", () => (includeSummary = cb.checked));
      row.appendChild(cb);
      row.appendChild(document.createTextNode("AI 요약도 함께 저장"));
      panelBody.appendChild(row);
    }

    if (warn) {
      const w = document.createElement("div");
      w.textContent =
        "분류 목록을 못 불러왔습니다 (" + warn + "). 직접 입력하거나 미분류로 저장됩니다.";
      w.style.cssText = "color:#a33;font-size:12px;margin-bottom:8px";
      panelBody.appendChild(w);
    }

    const save = document.createElement("button");
    save.textContent = "Notion에 저장";
    save.style.cssText =
      "padding:7px 14px !important;background:#1a5fb4 !important;color:#fff !important;border:none !important;" +
      "border-radius:6px !important;font-weight:600 !important;cursor:pointer !important;font-size:13px !important;" +
      "outline:none !important;box-shadow:none !important";
    save.addEventListener("click", () =>
      sendNotionExport(base, Array.from(chosen), includeSummary ? summary : null)
    );
    panelBody.appendChild(save);

    paint();
  }

  function sendNotionExport(base, category, summary) {
    showPanel("Notion", "Notion에 저장 중…", false);
    chrome.runtime.sendMessage(
      Object.assign({}, base, { category, summary }),
      (resp) => {
        if (chrome.runtime.lastError)
          return showPanel("Notion", "오류: " + chrome.runtime.lastError.message, false);
        if (resp && resp.ok) {
          // window.open 을 쓰지 않는다 — 이미지 업로드로 콜백이 늦어지면 클릭 제스처가 만료돼
          // 팝업이 막히고 about:blank 유령 창이 뜬다. 대신 사용자가 직접 클릭할 링크를 띄운다.
          showPanel("Notion", "저장 완료 ✅", false);
          if (resp.url) {
            const a = document.createElement("a");
            a.href = resp.url;
            a.target = "_blank";
            a.rel = "noopener";
            a.textContent = "Notion에서 열기 ↗";
            a.style.cssText = "color:#1a5fb4;display:inline-block;margin-top:10px;font-weight:600";
            panelBody.appendChild(a);
          }
        } else {
          showPanel("Notion", "실패: " + ((resp && resp.error) || "알 수 없음"), false);
        }
      }
    );
  }
})();
