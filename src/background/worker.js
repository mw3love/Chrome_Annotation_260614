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
});
