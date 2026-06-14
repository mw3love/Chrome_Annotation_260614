// 백그라운드 서비스 워커 (1단계: 도구막대 토글만)
// 이후 단계에서 화면 캡처(captureVisibleTab)와 게이트웨이 API 호출이 여기 붙는다.
chrome.action.onClicked.addListener((tab) => {
  if (tab.id != null) {
    chrome.tabs.sendMessage(tab.id, { type: "toggle-toolbar" }).catch(() => {});
  }
});

const GW_BASE = "https://factchat-cloud.mindlogic.ai/v1/gateway";

// 게이트웨이 chat 호출 — 키는 storage 에서 읽는다(콘텐츠/옵션 어디서 호출하든 CORS 우회)
async function gwChat(body) {
  const { gw_key } = await chrome.storage.local.get("gw_key");
  if (!gw_key) throw new Error("API 키가 설정되지 않았습니다 (확장 옵션에서 입력하세요).");
  const res = await fetch(GW_BASE + "/chat/completions", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + gw_key,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error("HTTP " + res.status + ": " + t.slice(0, 200));
  }
  const data = await res.json();
  return (data.choices && data.choices[0] && data.choices[0].message.content) || "";
}

// 게이트웨이가 제공하는 모델 목록 (OpenAI 호환 /models)
async function gwModels() {
  const { gw_key } = await chrome.storage.local.get("gw_key");
  if (!gw_key) throw new Error("API 키가 설정되지 않았습니다.");
  const res = await fetch(GW_BASE + "/models/", {
    headers: { Authorization: "Bearer " + gw_key },
  });
  if (!res.ok) throw new Error("HTTP " + res.status);
  const data = await res.json();
  return (data.data || []).map((m) => ({ id: m.id, owner: m.owned_by || "" }));
}

// ---------- Notion 연동 (5단계: 아카이빙) ----------
const NOTION_BASE = "https://api.notion.com/v1";
const NOTION_VERSION = "2026-03-11";

// 토큰 헤더 — extra 로 Content-Type 등 덧붙임(멀티파트는 extra 생략해 fetch 가 boundary 자동 설정)
async function notionHeaders(extra) {
  const { notion_token } = await chrome.storage.local.get("notion_token");
  if (!notion_token) throw new Error("Notion 토큰이 설정되지 않았습니다 (확장 옵션에서 입력하세요).");
  return Object.assign(
    { Authorization: "Bearer " + notion_token, "Notion-Version": NOTION_VERSION },
    extra || {}
  );
}

async function notionFetch(path, opts) {
  const res = await fetch(NOTION_BASE + path, opts);
  if (!res.ok) {
    const t = await res.text();
    throw new Error("Notion HTTP " + res.status + ": " + t.slice(0, 300));
  }
  return res.json();
}

// 사용자가 URL 전체/대시 포함 ID 어떤 걸 붙여넣어도 32자리 hex 페이지 ID 를 추출.
// 페이지 ID 는 URL 맨 끝 32자리 → '끝에서부터' 뽑는다. (제목 슬러그에 날짜 등 hex-유사 숫자가
// 섞이면 앞에서부터 끊을 때 ID 앞에 붙어버려 잘못된 32자리를 집는 문제가 있었다.)
function normNotionId(s) {
  const path = String(s || "")
    .split("?")[0] // 쿼리(?v=뷰ID 등) 제거
    .split("#")[0] // 앵커(#블록ID) 제거
    .replace(/\/+$/, "") // 끝 슬래시 제거
    .replace(/-/g, ""); // 대시 제거(URL 슬러그 + UUID 대시)
  const end = path.match(/[0-9a-fA-F]{32}$/); // 끝에 붙은 32자리가 페이지 ID
  if (end) return end[0];
  const any = path.match(/[0-9a-fA-F]{32}/g); // 보강: 끝 매칭 실패 시 마지막 후보
  return any ? any[any.length - 1] : path.trim();
}

function dataUrlToBlob(dataUrl) {
  const [meta, b64] = String(dataUrl).split(",");
  const mime = ((meta || "").match(/data:([^;]+)/) || [])[1] || "image/png";
  const bin = atob(b64 || "");
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

// 캡처 PNG(dataURL) → File Upload 3단계 → file_upload id 반환
async function notionUploadImage(dataUrl) {
  const created = await notionFetch("/file_uploads", {
    method: "POST",
    headers: await notionHeaders({ "Content-Type": "application/json" }),
    body: "{}",
  });
  const form = new FormData();
  form.append("file", dataUrlToBlob(dataUrl), "capture.png");
  const sent = await notionFetch("/file_uploads/" + created.id + "/send", {
    method: "POST",
    headers: await notionHeaders(), // Content-Type 생략 → fetch 가 multipart boundary 자동 설정
    body: form,
  });
  return sent.id || created.id;
}

const notionRich = (text) => [{ type: "text", text: { content: String(text).slice(0, 2000) } }];

// 수집한 주석·요약 + 업로드된 이미지 id 로 Notion 블록 배열 구성
function notionExportBlocks(spec, imageIds) {
  const blocks = [];
  if (spec.url) blocks.push({ type: "bookmark", bookmark: { url: spec.url } });
  let imgIdx = 0;
  for (const it of spec.items || []) {
    if (it.kind === "quote") {
      blocks.push({ type: "quote", quote: { rich_text: notionRich(it.text) } });
    } else if (it.kind === "image") {
      const id = imageIds[imgIdx++];
      if (id) blocks.push({ type: "image", image: { type: "file_upload", file_upload: { id } } });
    }
  }
  if (spec.summary && spec.summary.length) {
    blocks.push({ type: "heading_2", heading_2: { rich_text: notionRich("AI 요약") } });
    for (const s of spec.summary) {
      if (s.kind === "h2") blocks.push({ type: "heading_3", heading_3: { rich_text: notionRich(s.text) } });
      else blocks.push({ type: "paragraph", paragraph: { rich_text: notionRich(s.text) } });
    }
  }
  return blocks;
}

// 페이지 생성 — children 은 요청당 100개 제한이라 초과분은 PATCH append
async function notionCreatePage(parentId, title, blocks) {
  const page = await notionFetch("/pages", {
    method: "POST",
    headers: await notionHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({
      parent: { page_id: normNotionId(parentId) },
      properties: { title: { title: notionRich(title || "Untitled") } },
      children: blocks.slice(0, 100),
    }),
  });
  let rest = blocks.slice(100);
  while (rest.length) {
    const batch = rest.slice(0, 100);
    rest = rest.slice(100);
    await notionFetch("/blocks/" + page.id + "/children", {
      method: "PATCH",
      headers: await notionHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ children: batch }),
    });
  }
  return page;
}

// 토큰 + 부모 페이지 공유 여부 확인(연결 테스트)
async function notionTest(parentId) {
  const page = await notionFetch("/pages/" + normNotionId(parentId), {
    headers: await notionHeaders(),
  });
  const titleProp = Object.values(page.properties || {}).find((p) => p.type === "title");
  const title = (titleProp && titleProp.title.map((t) => t.plain_text).join("")) || "(제목 없음)";
  return title;
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg) return;

  // 콘텐츠 스크립트의 캡처 요청 → 현재 보이는 탭 화면을 PNG dataURL 로 반환
  if (msg.type === "capture") {
    const windowId = sender.tab ? sender.tab.windowId : chrome.windows.WINDOW_ID_CURRENT;
    chrome.tabs.captureVisibleTab(windowId, { format: "png" }, (dataUrl) => {
      if (chrome.runtime.lastError) sendResponse({ error: chrome.runtime.lastError.message });
      else sendResponse({ dataUrl });
    });
    return true;
  }

  // 옵션 페이지의 연결 테스트
  if (msg.type === "gw-test") {
    gwChat({
      model: msg.model || "gemini-2.5-flash",
      messages: [{ role: "user", content: "연결 테스트. '연결됨' 이라고만 답해." }],
    })
      .then((reply) => sendResponse({ ok: true, reply }))
      .catch((e) => sendResponse({ ok: false, error: e.message }));
    return true;
  }

  // 콘텐츠 스크립트의 일반 chat 호출 (요약·이미지 질문) — body 를 그대로 전달
  if (msg.type === "gw-chat") {
    gwChat(msg.body)
      .then((reply) => sendResponse({ ok: true, reply }))
      .catch((e) => sendResponse({ ok: false, error: e.message }));
    return true;
  }

  // 옵션 페이지: 모델 목록 조회
  if (msg.type === "gw-models") {
    gwModels()
      .then((models) => sendResponse({ ok: true, models }))
      .catch((e) => sendResponse({ ok: false, error: e.message }));
    return true;
  }

  // 옵션 페이지: Notion 연결 테스트(토큰 + 부모 페이지 공유 확인)
  if (msg.type === "notion-test") {
    notionTest(msg.parentId)
      .then((title) => sendResponse({ ok: true, title }))
      .catch((e) => sendResponse({ ok: false, error: e.message }));
    return true;
  }

  // 콘텐츠 스크립트: 주석+요약을 Notion 페이지로 저장
  // (이미지부터 업로드해 id 확보 → 블록 구성 → 페이지 생성. 모든 Notion 호출은 워커에서 = CORS 우회)
  if (msg.type === "notion-export") {
    (async () => {
      const imageIds = [];
      for (const it of msg.items || []) {
        if (it.kind === "image") imageIds.push(await notionUploadImage(it.dataUrl));
      }
      const blocks = notionExportBlocks(msg, imageIds);
      return notionCreatePage(msg.parentId, msg.title, blocks);
    })()
      .then((page) => sendResponse({ ok: true, url: page.url, id: page.id }))
      .catch((e) => sendResponse({ ok: false, error: e.message }));
    return true;
  }
});
