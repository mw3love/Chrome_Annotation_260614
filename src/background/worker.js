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
// 순서: 주석을 문서 위→아래 위치순으로 인용·이미지를 섞어 배치(주석정리 패널과 동일) → AI 요약.
// URL·네모 개수는 DB 속성(URL·네모)에 있으므로 본문에는 북마크·콜아웃을 넣지 않는다.
function notionExportBlocks(spec, imageIds) {
  const blocks = [];
  let imgIdx = 0;
  for (const it of spec.items || []) {
    if (it.kind === "quote") {
      blocks.push({ type: "quote", quote: { rich_text: notionRich(it.text) } });
    } else if (it.kind === "image") {
      const id = imageIds[imgIdx++];
      if (id) blocks.push({ type: "image", image: { type: "file_upload", file_upload: { id } } });
    }
  }
  // AI 요약 (포함 선택 시에만 spec.summary 가 채워져 옴)
  if (spec.summary && spec.summary.length) {
    blocks.push({ type: "heading_2", heading_2: { rich_text: notionRich("AI 요약") } });
    for (const s of spec.summary) {
      if (s.kind === "h2") blocks.push({ type: "heading_3", heading_3: { rich_text: notionRich(s.text) } });
      else blocks.push({ type: "paragraph", paragraph: { rich_text: notionRich(s.text) } });
    }
  }
  return blocks;
}

// 인박스 DB 스키마 — '제목' 이 title 속성. 행 생성 시 키가 이와 정확히 일치해야 함.
function notionDbSchema() {
  return {
    제목: { title: {} },
    URL: { url: {} },
    저장일: { date: {} },
    분류: { select: { options: [{ name: "미분류" }] } },
    하이라이트: { number: {} },
    네모: { number: {} },
    요약포함: { checkbox: {} },
  };
}

// 확장이 만드는 인박스 DB 의 제목 — 이 제목으로 부모 페이지 안의 기존 DB 를 찾아
// 여러 PC(브라우저)가 같은 부모 페이지를 가리키면 같은 DB 에 연결되게 한다(로컬 캐시 비의존).
const NOTION_INBOX_TITLE = "Reading Highlighter 인박스";

// 부모 페이지의 자식 블록을 훑어 child_database 만 추출(100개 초과는 페이지네이션).
async function notionListChildDatabases(parentKey) {
  const out = [];
  let cursor = null;
  do {
    const qs = "?page_size=100" + (cursor ? "&start_cursor=" + cursor : "");
    const res = await notionFetch("/blocks/" + parentKey + "/children" + qs, {
      headers: await notionHeaders(),
    });
    for (const b of res.results || []) {
      if (b.type === "child_database")
        out.push({
          id: b.id,
          title: (b.child_database && b.child_database.title) || "",
          created: b.created_time || "",
        });
    }
    cursor = res.has_more ? res.next_cursor : null;
  } while (cursor);
  return out;
}

// 제목이 인박스 DB 와 정확히 일치하는 것만(다른 제목 DB 는 무시)
async function notionFindInboxDatabases(parentKey) {
  const all = await notionListChildDatabases(parentKey);
  return all.filter((d) => d.title === NOTION_INBOX_TITLE);
}

// database_id → data_source_id (2025-09-03+ 버전부터 행 부모는 data_source_id)
async function notionDataSourceIdOf(databaseId) {
  const db = await notionFetch("/databases/" + databaseId, {
    headers: await notionHeaders(),
  });
  const dsId = db.data_sources && db.data_sources[0] && db.data_sources[0].id;
  if (!dsId) throw new Error("DB 에 data_source 가 없습니다: " + databaseId);
  return dsId;
}

// 부모 페이지 밑에 인박스 DB 를 새로 생성하고 {databaseId, dataSourceId} 반환
async function notionCreateInboxDatabase(parentKey) {
  const db = await notionFetch("/databases", {
    method: "POST",
    headers: await notionHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({
      parent: { type: "page_id", page_id: parentKey },
      title: notionRich(NOTION_INBOX_TITLE),
      initial_data_source: { properties: notionDbSchema() },
    }),
  });
  const dsId = db.data_sources && db.data_sources[0] && db.data_sources[0].id;
  if (!dsId) throw new Error("DB 생성 응답에 data_source 가 없습니다.");
  return { databaseId: db.id, dataSourceId: dsId };
}

// 확보한 DB 를 로컬 캐시에 기록(다음부터 fast-path)
async function notionCacheDb(parentKey, databaseId, dataSourceId) {
  await chrome.storage.local.set({
    notion_db_id: databaseId,
    notion_data_source_id: dataSourceId,
    notion_db_parent: parentKey,
  });
}

// 내보내기용 DB 확보 — 로컬 캐시 우선, 없으면 부모 페이지에서 기존 인박스 DB 탐색.
// 0개=새로 생성 / 1개=재사용 / 2개 이상=모호 → 옵션 화면에서 선택하도록 에러로 안내.
async function notionGetOrCreateDatabase(parentId) {
  const parentKey = normNotionId(parentId);
  const saved = await chrome.storage.local.get([
    "notion_data_source_id",
    "notion_db_parent",
  ]);
  if (saved.notion_data_source_id && saved.notion_db_parent === parentKey)
    return saved.notion_data_source_id;

  const found = await notionFindInboxDatabases(parentKey);
  if (found.length === 1) {
    const dsId = await notionDataSourceIdOf(found[0].id);
    await notionCacheDb(parentKey, found[0].id, dsId);
    return dsId;
  }
  if (found.length === 0) {
    const { databaseId, dataSourceId } = await notionCreateInboxDatabase(parentKey);
    await notionCacheDb(parentKey, databaseId, dataSourceId);
    return dataSourceId;
  }
  throw new Error(
    "이 부모 페이지에 '" + NOTION_INBOX_TITLE + "' DB 가 " + found.length +
      "개 있습니다. 확장 옵션의 'Notion 연결 테스트'에서 사용할 DB 를 선택하세요."
  );
}

// 행 속성 — notionDbSchema 의 키와 정확히 일치해야 함.
function notionRowProps(spec) {
  const props = {
    제목: { title: notionRich(spec.title || "Untitled") },
    저장일: { date: { start: new Date().toISOString() } },
    분류: { select: { name: "미분류" } },
    하이라이트: { number: spec.hlCount || 0 },
    네모: { number: spec.rectCount || 0 },
    요약포함: { checkbox: !!(spec.summary && spec.summary.length) },
  };
  if (spec.url) props.URL = { url: spec.url };
  return props;
}

// DB 행(=페이지) 생성 — children 은 요청당 100개 제한이라 초과분은 PATCH append
async function notionCreateRow(dataSourceId, spec, blocks) {
  const page = await notionFetch("/pages", {
    method: "POST",
    headers: await notionHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({
      parent: { type: "data_source_id", data_source_id: dataSourceId },
      properties: notionRowProps(spec),
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

// 옵션 페이지용: 부모 페이지 접근 확인 + 인박스 DB 상태 해석.
// none=아직 없음(저장 시 생성) / single=기존 1개 자동 연결(캐시 저장) / multiple=여러 개(선택 필요)
async function notionConnect(parentId) {
  const parentKey = normNotionId(parentId);
  const title = await notionTest(parentId); // 부모 페이지 접근·제목 확인
  const found = await notionFindInboxDatabases(parentKey);
  if (found.length === 1) {
    const dsId = await notionDataSourceIdOf(found[0].id);
    await notionCacheDb(parentKey, found[0].id, dsId);
    return { title, db: { status: "single" } };
  }
  if (found.length === 0) return { title, db: { status: "none" } };
  return { title, db: { status: "multiple", candidates: found } };
}

// 옵션 페이지용: 모호(2개+)할 때 사용자가 고른 DB 를 캐시에 확정
async function notionPickDatabase(parentId, databaseId) {
  const parentKey = normNotionId(parentId);
  const dsId = await notionDataSourceIdOf(databaseId);
  await notionCacheDb(parentKey, databaseId, dsId);
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

  // 옵션 페이지: Notion 연결 테스트(토큰·부모 페이지 확인 + 인박스 DB 상태 해석)
  if (msg.type === "notion-connect") {
    notionConnect(msg.parentId)
      .then((r) => sendResponse({ ok: true, title: r.title, db: r.db }))
      .catch((e) => sendResponse({ ok: false, error: e.message }));
    return true;
  }

  // 옵션 페이지: 인박스 DB 가 여러 개일 때 사용자가 고른 DB 확정
  if (msg.type === "notion-pick-db") {
    notionPickDatabase(msg.parentId, msg.databaseId)
      .then(() => sendResponse({ ok: true }))
      .catch((e) => sendResponse({ ok: false, error: e.message }));
    return true;
  }

  // 콘텐츠 스크립트: 주석+요약을 Notion 인박스 DB 의 행으로 저장
  // (DB 확보/생성 → 이미지 업로드해 id 확보 → 블록 구성 → 행 생성. 모든 Notion 호출은 워커에서 = CORS 우회)
  if (msg.type === "notion-export") {
    (async () => {
      const dataSourceId = await notionGetOrCreateDatabase(msg.parentId);
      const imageIds = [];
      for (const it of msg.items || []) {
        if (it.kind === "image") imageIds.push(await notionUploadImage(it.dataUrl));
      }
      const blocks = notionExportBlocks(msg, imageIds);
      return notionCreateRow(dataSourceId, msg, blocks);
    })()
      .then((page) => sendResponse({ ok: true, url: page.url, id: page.id }))
      .catch((e) => sendResponse({ ok: false, error: e.message }));
    return true;
  }
});
