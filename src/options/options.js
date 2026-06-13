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
