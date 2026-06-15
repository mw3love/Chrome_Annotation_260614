const keyEl = document.getElementById("key");
const modelEl = document.getElementById("model");
const statusEl = document.getElementById("status");

function setStatus(text, cls) {
  statusEl.textContent = text;
  statusEl.className = cls || "";
}

let savedModel = "gemini-2.5-flash";

// 저장된 값 불러오기 + 모델 목록 동적 로드
chrome.storage.local.get(["gw_key", "gw_model"]).then(({ gw_key, gw_model }) => {
  if (gw_key) keyEl.value = gw_key;
  if (gw_model) savedModel = gw_model;
  // 저장된 모델을 우선 반영(목록 로드 전이라도 선택 유지)
  ensureOption(savedModel);
  modelEl.value = savedModel;
  if (gw_key) loadModels();
});

// 저장된 모델이 목록에 없을 수 있으니 임시 옵션을 보장
function ensureOption(id) {
  if (!id) return;
  if (![...modelEl.options].some((o) => o.value === id)) {
    modelEl.add(new Option(id, id));
  }
}

function loadModels() {
  chrome.runtime.sendMessage({ type: "gw-models" }, (resp) => {
    if (chrome.runtime.lastError || !resp || !resp.ok) return; // 실패해도 기본 옵션 유지
    // owner별로 정렬해 목록 구성
    const models = resp.models.slice().sort((a, b) =>
      (a.owner + a.id).localeCompare(b.owner + b.id)
    );
    modelEl.innerHTML = "";
    let lastOwner = null;
    let group = null;
    for (const m of models) {
      if (m.owner !== lastOwner) {
        group = document.createElement("optgroup");
        group.label = m.owner || "기타";
        modelEl.add(group);
        lastOwner = m.owner;
      }
      group.appendChild(new Option(m.id, m.id));
    }
    ensureOption(savedModel);
    modelEl.value = savedModel;
  });
}

async function persist() {
  await chrome.storage.local.set({
    gw_key: keyEl.value.trim(),
    gw_model: modelEl.value,
  });
}

document.getElementById("save").addEventListener("click", async () => {
  await persist();
  savedModel = modelEl.value;
  setStatus("저장됨.", "ok");
  if (keyEl.value.trim()) loadModels(); // 키가 있으면 전체 모델 목록 갱신
});

document.getElementById("test").addEventListener("click", async () => {
  await persist();
  if (!keyEl.value.trim()) return setStatus("키를 먼저 입력하세요.", "err");
  setStatus("테스트 중…", "");
  chrome.runtime.sendMessage({ type: "gw-test", model: modelEl.value }, (resp) => {
    if (chrome.runtime.lastError) {
      return setStatus("오류: " + chrome.runtime.lastError.message, "err");
    }
    if (resp && resp.ok) setStatus("연결 성공 ✓  응답: " + resp.reply, "ok");
    else setStatus("실패: " + ((resp && resp.error) || "알 수 없음"), "err");
  });
});

// ---------- Notion 설정 ----------
const notionTokenEl = document.getElementById("notion-token");
const notionParentEl = document.getElementById("notion-parent");
const notionStatusEl = document.getElementById("notion-status");

function setNotionStatus(text, cls) {
  notionStatusEl.textContent = text;
  notionStatusEl.className = cls || "";
}

chrome.storage.local.get(["notion_token", "notion_parent_id"]).then((s) => {
  if (s.notion_token) notionTokenEl.value = s.notion_token;
  if (s.notion_parent_id) notionParentEl.value = s.notion_parent_id;
});

async function persistNotion() {
  await chrome.storage.local.set({
    notion_token: notionTokenEl.value.trim(),
    notion_parent_id: notionParentEl.value.trim(),
  });
}

document.getElementById("notion-save").addEventListener("click", async () => {
  await persistNotion();
  setNotionStatus("저장됨.", "ok");
});

const notionDbSelectEl = document.getElementById("notion-db-select");
const notionDbPickEl = document.getElementById("notion-db-pick");

function hideDbPicker() {
  notionDbSelectEl.style.display = "none";
  notionDbPickEl.style.display = "none";
  notionDbSelectEl.innerHTML = "";
}

document.getElementById("notion-test").addEventListener("click", async () => {
  await persistNotion();
  hideDbPicker();
  if (!notionTokenEl.value.trim() || !notionParentEl.value.trim()) {
    return setNotionStatus("토큰과 부모 페이지를 먼저 입력하세요.", "err");
  }
  setNotionStatus("확인 중…", "");
  chrome.runtime.sendMessage(
    { type: "notion-connect", parentId: notionParentEl.value.trim() },
    (resp) => {
      if (chrome.runtime.lastError) {
        return setNotionStatus("오류: " + chrome.runtime.lastError.message, "err");
      }
      if (!resp || !resp.ok) {
        return setNotionStatus("실패: " + ((resp && resp.error) || "알 수 없음"), "err");
      }
      const base = '연결 성공 ✓  부모 페이지: "' + resp.title + '"';
      const db = resp.db || {};
      if (db.status === "single") {
        setNotionStatus(base + " — 기존 인박스 DB에 연결됨.", "ok");
      } else if (db.status === "none") {
        setNotionStatus(base + " — 저장 시 인박스 DB가 새로 생성됩니다.", "ok");
      } else if (db.status === "multiple") {
        setNotionStatus(base + " — 인박스 DB가 여러 개입니다. 사용할 DB를 선택하세요.", "err");
        for (const c of db.candidates || []) {
          const when = c.created ? new Date(c.created).toLocaleString() : "";
          const shortId = String(c.id).replace(/-/g, "").slice(0, 8);
          notionDbSelectEl.add(
            new Option(c.title + " — 생성 " + when + " (" + shortId + "…)", c.id)
          );
        }
        notionDbSelectEl.style.display = "block";
        notionDbPickEl.style.display = "inline-block";
      } else {
        setNotionStatus(base, "ok");
      }
    }
  );
});

notionDbPickEl.addEventListener("click", () => {
  const databaseId = notionDbSelectEl.value;
  if (!databaseId) return;
  setNotionStatus("연결 중…", "");
  chrome.runtime.sendMessage(
    { type: "notion-pick-db", parentId: notionParentEl.value.trim(), databaseId },
    (resp) => {
      if (chrome.runtime.lastError) {
        return setNotionStatus("오류: " + chrome.runtime.lastError.message, "err");
      }
      if (resp && resp.ok) {
        hideDbPicker();
        setNotionStatus("선택한 DB에 연결됨 ✓", "ok");
      } else {
        setNotionStatus("실패: " + ((resp && resp.error) || "알 수 없음"), "err");
      }
    }
  );
});
