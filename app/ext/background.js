const ESMP_LOGIN = "https://esmp.upm.edu.my/smp/action/security/loginSmpSetup";

chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === "open-app") chrome.tabs.create({ url: chrome.runtime.getURL("index.html") });
});

// Klik ikon toolbar: kalau dah dalam eSMP, terus jana; kalau tak, buka eSMP.
chrome.action.onClicked.addListener(async (tab) => {
  if (tab.url?.startsWith("https://esmp.upm.edu.my/smp/")) {
    try {
      await chrome.tabs.sendMessage(tab.id, { type: "generate" });
      return;
    } catch { /* content script belum dimuat, contoh tab dibuka sebelum extension dipasang */ }
  }
  chrome.tabs.create({ url: ESMP_LOGIN });
});
