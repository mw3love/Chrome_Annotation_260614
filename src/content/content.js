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

  // ---------- 도구막대 ----------
  const bar = document.createElement("div");
  bar.className = "ca-toolbar";
  // 순서: [이동⠿][버튼묶음][접기◂/▸] — 도구막대를 오른쪽 고정(right 기준)해 접기 버튼이
  // 맨 오른쪽 제자리에 고정. 접으면 왼쪽으로만 줄어들어 버튼 위치(마우스)가 안 바뀜.
  bar.innerHTML =
    '<span class="ca-grip" title="드래그해 이동">⠿</span>' +
    '<span class="ca-bar-main">' +
    '<button data-mode="highlight" title="형광펜 (단축키 1)">🖊️ 형광펜</button>' +
    '<button data-mode="rect" title="네모 캡처 영역 (단축키 2)">⬚ 네모</button>' +
    '<button data-act="summarize" title="강조 부분 중심으로 AI 요약">🤖 요약</button>' +
    '<button data-act="pdf" title="페이지 주석 PDF로 저장">💾 저장</button>' +
    '<button data-act="md" title="페이지 주석 마크다운 복사(텍스트만)">📋 MD</button>' +
    "</span>" +
    '<button class="ca-bar-min" data-act="bar-min" title="도구막대 접기/펼치기">▸</button>';
  bar.classList.add("ca-bar-collapsed"); // 기본은 접힌 상태

  // 모드 활성 신호: 화면 가장자리 테두리 + 배지 (클릭 통과)
  const modeFx = document.createElement("div");
  modeFx.className = "ca-modefx";
  modeFx.appendChild(document.createElement("span")); // 배지 텍스트 담길 자리
  document.documentElement.appendChild(modeFx);
  document.documentElement.appendChild(bar);

  // 주석 hover 시 뜨는 미니 툴바 — 네모는 [💾 저장][✕ 삭제], 형광펜은 [✕ 삭제]
  const tools = document.createElement("div");
  tools.className = "ca-tools";
  tools.style.display = "none";
  const btnAsk = document.createElement("button");
  btnAsk.className = "ca-tool";
  btnAsk.textContent = "🤖";
  btnAsk.title = "이 주석에 AI로 질문";
  const btnDel = document.createElement("button");
  btnDel.className = "ca-tool ca-tool-del";
  btnDel.textContent = "✕";
  btnDel.title = "삭제";
  tools.append(btnAsk, btnDel);
  document.documentElement.appendChild(tools);

  // AI 결과 표시 패널
  const panel = document.createElement("div");
  panel.className = "ca-panel";
  panel.style.display = "none";
  panel.innerHTML =
    '<div class="ca-panel-head"><span class="ca-panel-grip" title="드래그해 이동">⠿</span>' +
    '<span class="ca-panel-title">AI</span>' +
    '<button class="ca-panel-mark" title="선택한 글자를 빨강 표시(토글). 단축키 `">`<span class="ca-mark-a">A</span>`</button>' +
    '<button class="ca-panel-clearmark" title="빨강 표시 모두 해제">↺</button>' +
    '<button class="ca-panel-pdf" title="요약 PDF로 저장">💾</button>' +
    '<button class="ca-panel-copy" title="복사">📋</button>' +
    '<button class="ca-panel-min" title="최소화/펼치기">▾</button></div>' +
    '<div class="ca-panel-body"></div>';
  document.documentElement.appendChild(panel);
  const panelBody = panel.querySelector(".ca-panel-body");
  let panelRaw = ""; // 복사용 원문(마크다운)
  let panelTitle = "";
  let panelIsMd = false;
  // 최소화/펼치기 — 헤더만 남기고 본문 접기
  const minBtn = panel.querySelector(".ca-panel-min");
  minBtn.addEventListener("click", () => {
    minBtn.textContent = panel.classList.toggle("ca-min") ? "▴" : "▾";
  });
  panel.querySelector(".ca-panel-copy").addEventListener("click", () => {
    navigator.clipboard.writeText(getPanelMarkdown()).catch(() => {});
  });
  // 요약 PDF — 패널 내용(색 포함)을 그대로 인쇄
  panel.querySelector(".ca-panel-pdf").addEventListener("click", () => exportSummaryPDF());

  // 요소를 핸들로 잡고 드래그해 이동(도구막대·패널 공용).
  // Pointer Capture 사용 — 페이지에 광고 iframe이 많아도 포인터 이벤트를 핸들이 독점해
  // 커서가 iframe 위를 지나도 드래그가 끊기지 않는다(mousemove 방식의 한계 회피).
  // rightAnchored=true 면 left 대신 right 로 위치를 잡는다(도구막대용 — 접힘이 항상 왼쪽으로 자라게).
  function makeDraggable(target, handle, rightAnchored) {
    let dx = 0;
    let dy = 0;
    let dragging = false;
    handle.addEventListener("pointerdown", (e) => {
      if (e.button !== 0 || e.target.closest("button")) return; // 버튼 클릭 제외
      const r = target.getBoundingClientRect();
      dx = e.clientX - r.left;
      dy = e.clientY - r.top;
      dragging = true;
      target.style.bottom = "auto";
      target.style.top = r.top + "px";
      if (rightAnchored) {
        target.style.left = "auto";
        target.style.right = window.innerWidth - r.right + "px";
      } else {
        target.style.right = "auto";
        target.style.left = r.left + "px";
      }
      handle.setPointerCapture(e.pointerId);
      e.preventDefault();
    });
    handle.addEventListener("pointermove", (e) => {
      if (!dragging) return;
      target.style.top = Math.max(0, Math.min(window.innerHeight - 30, e.clientY - dy)) + "px";
      if (rightAnchored) {
        const right = window.innerWidth - (e.clientX - dx) - target.offsetWidth;
        target.style.right = Math.max(0, Math.min(window.innerWidth - 40, right)) + "px";
      } else {
        target.style.left = Math.max(0, Math.min(window.innerWidth - 40, e.clientX - dx)) + "px";
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

  makeDraggable(panel, panel.querySelector(".ca-panel-head")); // 패널: 헤더로 이동
  makeDraggable(bar, bar.querySelector(".ca-grip"), true); // 도구막대: ⠿ 손잡이로 이동(오른쪽 고정)

  // 백틱(빨강) 표시 — 토글. 버튼을 켜두면(활성) 패널에서 선택만 해도 표시/해제됨.
  // 단축키: 패널에 선택이 있을 때 ` 키로도 표시/해제.
  let markMode = false;
  const markBtn = panel.querySelector(".ca-panel-mark");
  markBtn.addEventListener("mousedown", (e) => e.preventDefault());
  markBtn.addEventListener("click", () => {
    markMode = !markMode;
    markBtn.classList.toggle("active", markMode);
    toggleMarkSelection(); // 선택돼 있으면 즉시 적용
  });
  panelBody.addEventListener("mouseup", () => {
    if (markMode) setTimeout(toggleMarkSelection, 0); // 선택 확정 후 적용
  });
  document.addEventListener("keydown", (e) => {
    if (e.key !== "`" || !panelIsMd) return;
    const sel = window.getSelection();
    if (sel && !sel.isCollapsed && panelBody.contains(sel.anchorNode)) {
      e.preventDefault();
      toggleMarkSelection();
    }
  });

  // 빨강 표시 전체 해제
  panel.querySelector(".ca-panel-clearmark").addEventListener("click", () => {
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
  function showPanel(title, text, isMd) {
    panel.classList.remove("ca-min"); // 새 내용이 오면 펼침
    minBtn.textContent = "▾";
    panel.querySelector(".ca-panel-title").textContent = title;
    panelTitle = title;
    panelIsMd = !!isMd;
    panelRaw = text;
    if (isMd) {
      panelBody.style.whiteSpace = "normal";
      panelBody.innerHTML = renderMarkdown(text);
    } else {
      panelBody.style.whiteSpace = "pre-wrap";
      panelBody.textContent = text;
    }
    panel.style.display = "flex";
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
    bar.contains(node) || tools.contains(node) || panel.contains(node);

  function applyMode(m) {
    mode = m;
    bar.querySelectorAll("button[data-mode]").forEach((b) =>
      b.classList.toggle("active", b.dataset.mode === m)
    );
    const root = document.documentElement;
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

  bar.addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    if (btn.dataset.act === "bar-min") {
      const collapsed = bar.classList.toggle("ca-bar-collapsed");
      btn.textContent = collapsed ? "▸" : "▾";
      return;
    }
    if (btn.dataset.act === "summarize") return aiSummarize();
    if (btn.dataset.act === "pdf") return exportPDF();
    if (btn.dataset.act === "md") return exportMarkdown();
    if (btn.dataset.act === "off") return applyMode(null);
    if (btn.dataset.mode === "highlight" && mode !== "highlight") return activateHighlight();
    applyMode(mode === btn.dataset.mode ? null : btn.dataset.mode);
  });

  // 도구막대 버튼 클릭이 페이지의 텍스트 선택을 지우지 않게 (선택 후 형광펜 눌러도 유지)
  bar.addEventListener("mousedown", (e) => {
    if (e.target.closest("button")) e.preventDefault();
  });

  // 단축키: 1 형광펜, 2 네모, Esc 해제 (입력창·조합키 중이면 무시)
  document.addEventListener("keydown", (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return; // 브라우저 조합키와 충돌 방지
    const el = document.activeElement;
    const typing =
      el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
    if (typing) return;
    if (e.key === "1") {
      e.preventDefault();
      mode === "highlight" ? applyMode(null) : activateHighlight();
    } else if (e.key === "2") {
      e.preventDefault();
      applyMode(mode === "rect" ? null : "rect");
    } else if (e.key === "Escape" && mode) {
      applyMode(null);
    }
  });

  // 확장 아이콘 클릭 → 도구막대 토글
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg && msg.type === "toggle-toolbar") bar.classList.toggle("ca-hidden");
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
    getSelectedTextNodes(range).forEach((node) => {
      const start = node === range.startContainer ? range.startOffset : 0;
      const end = node === range.endContainer ? range.endOffset : node.nodeValue.length;
      if (start >= end) return;
      wrapTextNode(node, start, end);
    });
    sel.removeAllRanges();
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
    } catch (_) {
      /* 드물게 실패하면 그 노드만 건너뜀 */
    }
  }

  // ---------- 네모 캡처영역 드래그 ----------
  let dragStart = null;
  let dragEl = null;
  let suppressClick = false; // 드래그 직후 따라오는 click 1회 무효화 플래그

  document.addEventListener("mousedown", (e) => {
    if (mode !== "rect" || e.button !== 0 || isUI(e.target)) return;
    e.preventDefault();
    dragStart = { x: e.pageX, y: e.pageY };
    dragEl = document.createElement("div");
    dragEl.className = "ca-rect";
    document.documentElement.appendChild(dragEl);
    drawRect(e);
  });

  document.addEventListener("mousemove", (e) => {
    if (dragEl) drawRect(e);
  });

  document.addEventListener("mouseup", (e) => {
    if (!dragEl) return;
    const box = boxOf(e);
    if (box.w < 8 || box.h < 8) {
      dragEl.remove(); // 너무 작으면 취소
    } else {
      const id = uid();
      dragEl.dataset.caId = id;
      const ann = { type: "rect", id, rect: box, image: null };
      annotations.push(ann);
      // 그린 영역을 즉시(조용히) 캡처해 주석에 저장 (저장 버튼/AI에서 재사용)
      captureRegion(box)
        .then((dataUrl) => (ann.image = dataUrl))
        .catch((err) => console.warn("[주석] 캡처 실패:", err));
    }
    dragEl = null;
    dragStart = null;
    // 드래그가 끝나면 브라우저가 click 을 한 번 더 쏜다 → 이미지/링크 팝업 방지로 1회 무효화
    suppressClick = true;
    setTimeout(() => (suppressClick = false), 0);
  });

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

  function drawRect(e) {
    const b = boxOf(e);
    Object.assign(dragEl.style, {
      left: b.x + "px",
      top: b.y + "px",
      width: b.w + "px",
      height: b.h + "px",
    });
  }

  // 화면을 찍어(captureVisibleTab) box 안쪽만 잘라 PNG dataURL 로 돌려준다.
  // 숨김/복원 없이, box 자기 테두리(BORDER px)만큼 안쪽을 잘라 빨간 테두리를 제외한다.
  const BORDER = 2; // .ca-rect 테두리 두께(px)와 일치
  function captureRegion(box) {
    return new Promise((resolve, reject) => {
      const sx = window.scrollX;
      const sy = window.scrollY;
      chrome.runtime.sendMessage({ type: "capture" }, (resp) => {
        if (chrome.runtime.lastError) return reject(chrome.runtime.lastError);
        if (!resp || resp.error || !resp.dataUrl)
          return reject(new Error((resp && resp.error) || "no data"));
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
          resolve(canvas.toDataURL("image/png"));
        };
        img.onerror = () => reject(new Error("image load fail"));
        img.src = resp.dataUrl;
      });
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

  document.addEventListener("mouseover", (e) => {
    if (dragEl) return; // 네모를 그리는 중에는 툴바를 띄우지 않음
    const el = e.target.closest("." + HL + ", .ca-rect");
    if (el) showToolsFor(el);
  });
  document.addEventListener("mouseout", (e) => {
    if (e.target.closest("." + HL + ", .ca-rect")) scheduleHide();
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
  btnAsk.addEventListener("click", async () => {
    if (!toolsTarget) return;
    const ann = annotations.find((a) => a.id === toolsTarget.dataset.caId);
    if (!ann) return;
    const isRect = ann.type === "rect";
    if (isRect && !ann.image) return alert("이미지가 아직 캡처되지 않았습니다.");

    const title = isRect ? "이미지 질문" : "텍스트 질문";
    const q = prompt(
      isRect ? "이 이미지에 대해 무엇을 물어볼까요?" : "이 문장에 대해 무엇을 물어볼까요?",
      isRect ? "이 이미지를 설명해줘." : "이 문장을 쉽게 설명해줘."
    );
    if (!q) return;

    const { gw_model } = await chrome.storage.local.get("gw_model");
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
      model = gw_model || "gemini-2.5-flash";
      const pageText = (document.body.innerText || "").slice(0, 6000);
      content =
        "사용자가 웹페이지를 읽다가 일부를 강조하고 질문한다. " +
        "아래 페이지 정보는 '사용자가 무엇을 보고 무엇을 묻는지' 파악하기 위한 맥락일 뿐이며, " +
        "답은 페이지 안에 한정하지 말고 너의 전체 지식으로 포괄적으로 작성하라.\n" +
        style +
        "\n[페이지 제목] " + document.title + "\n" +
        "[URL] " + location.href + "\n" +
        '[사용자가 강조한 부분] "' + ann.text + '"\n\n' +
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
        if (resp && resp.ok) showPanel(title, resp.reply, true);
        else showPanel(title, "실패: " + ((resp && resp.error) || "알 수 없음"), false);
      }
    );
  });

  function removeHighlight(span) {
    const parent = span.parentNode;
    while (span.firstChild) parent.insertBefore(span.firstChild, span);
    parent.removeChild(span);
    parent.normalize();
    dropAnnotation(span.dataset.caId);
  }

  function removeAnnotation(el) {
    dropAnnotation(el.dataset.caId);
    el.remove();
  }

  function dropAnnotation(id) {
    const i = annotations.findIndex((a) => a.id === id);
    if (i >= 0) annotations.splice(i, 1);
  }

  // ---------- 내보내기 ----------
  // 주석을 문서 위→아래 순서로 정렬 (형광펜=화면 위치, 네모=캡처 당시 y)
  function collectSorted() {
    return annotations
      .map((a) => {
        let y = a.type === "rect" ? a.rect.y : 0;
        if (a.type === "highlight") {
          const el = document.querySelector("." + HL + '[data-ca-id="' + a.id + '"]');
          if (el) y = el.getBoundingClientRect().top + window.scrollY;
        }
        return { ann: a, y };
      })
      .sort((p, q) => p.y - q.y)
      .map((x) => x.ann);
  }

  function buildHTML(items) {
    const esc = (s) =>
      String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
    const body = items
      .map((it) =>
        it.type === "highlight"
          ? "<blockquote>" + esc(it.text) + "</blockquote>"
          : it.image
          ? '<figure><img src="' + it.image + '"></figure>'
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
  async function aiSummarize() {
    const items = collectSorted();
    const quotes = items.filter((it) => it.type === "highlight").map((it) => it.text);
    const rects = items.filter((it) => it.type === "rect" && it.image);
    const { gw_model } = await chrome.storage.local.get("gw_model");
    const model = gw_model || "gemini-2.5-flash";
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
    showPanel("요약", "요약 중…", false);
    chrome.runtime.sendMessage(
      { type: "gw-chat", body: { model, messages: [{ role: "user", content }] } },
      (resp) => {
        if (chrome.runtime.lastError) return showPanel("요약", "오류: " + chrome.runtime.lastError.message, false);
        if (resp && resp.ok) showPanel("요약", resp.reply, true);
        else showPanel("요약", "실패: " + ((resp && resp.error) || "알 수 없음"), false);
      }
    );
  }

  function exportMarkdown() {
    // 텍스트(형광펜)만 복사 — 이미지는 PDF/노션 경로가 담당
    const quotes = collectSorted().filter((it) => it.type === "highlight");
    if (!quotes.length) return alert("복사할 텍스트 주석(형광펜)이 없습니다.");
    let md = "# " + document.title + "\n\n" + location.href + "\n\n";
    quotes.forEach((it) => (md += "> " + it.text + "\n\n"));
    navigator.clipboard
      .writeText(md)
      .then(() => alert("텍스트 인용문이 클립보드에 복사되었습니다."))
      .catch((e) => alert("복사 실패: " + e.message));
  }
})();
