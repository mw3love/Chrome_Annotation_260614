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
    } else if (it.kind === "note") {
      blocks.push({ type: "paragraph", paragraph: { rich_text: notionRich(it.text) } });
    } else if (it.kind === "image") {
      const id = imageIds[imgIdx++];
      if (id) {
        const image = { type: "file_upload", file_upload: { id } };
        // 노션 이미지 블록의 네이티브 캡션 — 실제 노션에서 사진 바로 아래 캡션으로 붙는다.
        if (it.caption && it.caption.trim()) image.caption = notionRich(it.caption);
        blocks.push({ type: "image", image });
      }
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

// data_source 객체에서 평문 제목을 뽑는다(2026-03-11 API: 최상위 title 배열).
function notionPlainTitle(ds) {
  const t = ds.title;
  if (Array.isArray(t)) return t.map((x) => x.plain_text || "").join("");
  return "";
}

// data_source/블록/DB 부모를 페이지까지 거슬러 올라가 페이지 id 를 찾는다(열·토글 중첩 대응, 최대 6단계).
// 검색 결과를 부모 페이지로 한정하는 데 쓴다. 못 풀면 null. (data_source 의 parent 는 보통 database_id)
async function notionAncestorPageId(parent) {
  let p = parent;
  for (let i = 0; i < 6 && p; i++) {
    if (p.type === "page_id") return normNotionId(p.page_id);
    if (p.type === "workspace") return null;
    if (p.type === "block_id") {
      const blk = await notionFetch("/blocks/" + p.block_id, { headers: await notionHeaders() });
      p = blk.parent;
    } else if (p.type === "database_id") {
      const db = await notionFetch("/databases/" + normNotionId(p.database_id), {
        headers: await notionHeaders(),
      });
      p = db.parent;
    } else if (p.type === "data_source_id") {
      const ds = await notionFetch("/data_sources/" + p.data_source_id, {
        headers: await notionHeaders(),
      });
      p = ds.parent;
    } else return null;
  }
  return null;
}

// 부모 페이지 안의 인박스 data_source 를 Notion 검색 API 로 찾는다(제목이 인박스 이름으로 시작).
// /blocks/children(직속 자식)과 달리 열(column)·토글 안에 중첩된 DB 도 찾는다 → 여러 PC·중첩 구조에서
// 동일 DB 재사용 가능. 반환 id 는 data_source_id(=행 부모로 바로 사용). 검색은 부모 범위 한정이 안 되므로
// 결과의 조상 페이지가 부모와 같은 것만 남긴다. (라벨 붙은 새 DB 도 접두 일치로 포함 — 예: "… — 맥북")
async function notionSearchInboxDataSources(parentKey) {
  const matched = [];
  let cursor = null;
  do {
    const body = {
      query: NOTION_INBOX_TITLE,
      filter: { property: "object", value: "data_source" }, // 2026-03-11: database 가 아니라 data_source
      page_size: 100,
    };
    if (cursor) body.start_cursor = cursor;
    const res = await notionFetch("/search", {
      method: "POST",
      headers: await notionHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(body),
    });
    for (const ds of res.results || []) {
      if (ds.object !== "data_source") continue;
      const title = notionPlainTitle(ds);
      if (!title.startsWith(NOTION_INBOX_TITLE)) continue;
      matched.push({ id: ds.id, title, created: ds.created_time || "", parent: ds.parent });
    }
    cursor = res.has_more ? res.next_cursor : null;
  } while (cursor);
  // 조상 페이지가 parentKey 인 것만 남긴다(못 풀면 안전하게 포함).
  const scoped = [];
  for (const d of matched) {
    let anc = null;
    try {
      anc = await notionAncestorPageId(d.parent);
    } catch (_) {}
    if (anc === null || anc === parentKey)
      scoped.push({ id: d.id, title: d.title, created: d.created });
  }
  return scoped;
}

// 부모 페이지 밑에 인박스 DB 를 새로 생성하고 {databaseId, dataSourceId} 반환.
// label 이 있으면 제목에 " — label" 을 붙여 같은 페이지의 다른 인박스 DB 와 구분한다(접두는 유지).
async function notionCreateInboxDatabase(parentKey, label) {
  const title = NOTION_INBOX_TITLE + (label && label.trim() ? " — " + label.trim() : "");
  const db = await notionFetch("/databases", {
    method: "POST",
    headers: await notionHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({
      parent: { type: "page_id", page_id: parentKey },
      title: notionRich(title),
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

// 활성 인박스 DB 포인터 — storage.sync 에 저장해 같은 크롬 계정의 모든 PC 가 동일 DB 를 쓰게 한다.
// (크롬 '동기화 사용'이 켜져 있어야 PC 간 전파됨. 꺼져 있으면 PC 별로 한 번씩 지정.)
async function notionGetActive(parentKey) {
  const s = await chrome.storage.sync.get([
    "notion_active_db_id",
    "notion_active_ds_id",
    "notion_active_parent",
  ]);
  if (s.notion_active_ds_id && s.notion_active_parent === parentKey) return s;
  return null;
}
async function notionSetActive(parentKey, databaseId, dataSourceId) {
  await chrome.storage.sync.set({
    notion_active_db_id: databaseId,
    notion_active_ds_id: dataSourceId,
    notion_active_parent: parentKey,
  });
  await notionCacheDb(parentKey, databaseId, dataSourceId); // 로컬 폴백도 일치시킴
}

// 내보내기용 DB 확보 — 활성 포인터(sync) 우선 → 로컬 캐시 폴백 → 검색.
// 검색: 1개=재사용 / 0개=새로 생성 / 2개 이상=모호 → 내보내기 패널에서 선택하도록 에러로 안내.
// (보통은 내보내기 패널의 DB 선택 단계가 먼저 활성 포인터를 지정하므로 여기선 그 값을 그대로 쓴다.)
async function notionGetOrCreateDatabase(parentId) {
  const parentKey = normNotionId(parentId);
  const active = await notionGetActive(parentKey);
  if (active) return active.notion_active_ds_id;

  const saved = await chrome.storage.local.get([
    "notion_data_source_id",
    "notion_db_parent",
  ]);
  if (saved.notion_data_source_id && saved.notion_db_parent === parentKey)
    return saved.notion_data_source_id;

  const found = await notionSearchInboxDataSources(parentKey); // id = data_source_id
  if (found.length === 1) {
    await notionSetActive(parentKey, found[0].id, found[0].id);
    return found[0].id;
  }
  if (found.length === 0) {
    const { databaseId, dataSourceId } = await notionCreateInboxDatabase(parentKey);
    await notionSetActive(parentKey, databaseId, dataSourceId);
    return dataSourceId;
  }
  throw new Error(
    "이 부모 페이지에 '" + NOTION_INBOX_TITLE + "' DB 가 " + found.length +
      "개 있습니다. 내보내기 패널에서 사용할 DB 를 선택하세요."
  );
}

// 분류(select) 후보 조회 — 데이터소스 스키마의 '분류' select 옵션 이름 목록.
// 내보내기 직전 패널에서 이 목록을 버튼으로 보여줘 사용자가 그 자리에서 분류를 고른다.
async function notionGetCategories(parentId) {
  const dataSourceId = await notionGetOrCreateDatabase(parentId);
  const ds = await notionFetch("/data_sources/" + dataSourceId, {
    headers: await notionHeaders(),
  });
  const prop = ds.properties && ds.properties["분류"];
  const opts = (prop && prop.select && prop.select.options) || [];
  return opts.map((o) => o.name);
}

// 행 속성 — notionDbSchema 의 키와 정확히 일치해야 함.
// 분류는 내보내기 시 사용자가 고른 값(없으면 미분류). 기존에 없는 이름이면 Notion 이 옵션을 자동 생성한다.
function notionRowProps(spec) {
  const props = {
    제목: { title: notionRich(spec.title || "Untitled") },
    저장일: { date: { start: new Date().toISOString() } },
    분류: { select: { name: (spec.category && spec.category.trim()) || "미분류" } },
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
  const found = await notionSearchInboxDataSources(parentKey); // id = data_source_id
  if (found.length === 1) {
    await notionSetActive(parentKey, found[0].id, found[0].id);
    return { title, db: { status: "single" } };
  }
  if (found.length === 0) return { title, db: { status: "none" } };
  return { title, db: { status: "multiple", candidates: found } };
}

// 고른 data_source 를 활성 포인터로 확정(옵션 페이지·내보내기 패널 공용).
// 인자 dataSourceId 는 검색이 돌려준 id(=행 부모로 바로 쓰는 data_source_id).
async function notionPickDatabase(parentId, dataSourceId) {
  const parentKey = normNotionId(parentId);
  await notionSetActive(parentKey, dataSourceId, dataSourceId);
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

  // 콘텐츠 스크립트: 내보내기 직전 분류(select) 후보 목록 조회
  if (msg.type === "notion-categories") {
    notionGetCategories(msg.parentId)
      .then((categories) => sendResponse({ ok: true, categories }))
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

  // 내보내기 패널: 부모 페이지의 인박스 DB(data_source) 목록 + 현재 활성 id
  if (msg.type === "notion-list-dbs") {
    (async () => {
      const parentKey = normNotionId(msg.parentId);
      const databases = await notionSearchInboxDataSources(parentKey); // id = data_source_id
      const active = await notionGetActive(parentKey);
      return { databases, activeId: active ? active.notion_active_ds_id : null };
    })()
      .then((r) => sendResponse({ ok: true, databases: r.databases, activeId: r.activeId }))
      .catch((e) => sendResponse({ ok: false, error: e.message }));
    return true;
  }

  // 내보내기 패널: 새 인박스 DB 생성(선택적 라벨) → 활성으로 지정
  if (msg.type === "notion-create-db") {
    (async () => {
      const parentKey = normNotionId(msg.parentId);
      const { databaseId, dataSourceId } = await notionCreateInboxDatabase(parentKey, msg.label);
      await notionSetActive(parentKey, databaseId, dataSourceId);
      return databaseId;
    })()
      .then((databaseId) => sendResponse({ ok: true, databaseId }))
      .catch((e) => sendResponse({ ok: false, error: e.message }));
    return true;
  }

  // 내보내기 패널: 고른 DB 를 활성으로 지정
  if (msg.type === "notion-set-active-db") {
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
