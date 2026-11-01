const API = "http://127.0.0.1:8000";

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "rrc:predict") return;

  fetch(`${API}/predict`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(message.review)
  })
    .then(async response => {
      if (!response.ok) throw new Error(`Prediction API returned HTTP ${response.status}`);
      sendResponse({ result: await response.json() });
    })
    .catch(error => {
      sendResponse({ error: error.message });
    });

  return true;
});
