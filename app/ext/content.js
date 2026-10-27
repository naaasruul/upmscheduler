// Dijalankan dalam halaman eSMP. Tambah butang "Jana Jadual"; bila diklik, ambil jadual
// kuliah + exam guna session login pelajar sendiri (same-origin), simpan dalam storan
// extension, dan buka halaman JadualKu. Password tak disentuh langsung.

const BASE = "https://esmp.upm.edu.my/smp/action/portal/student/MyTimetable/";
const URL_CLASS = BASE + "MTT_GetJadualWaktuKuliahPelajar_AjaxSetupAction";
const URL_EXAM = BASE + "MTT_GetJadualWaktuPeperiksaanPelajar_AjaxSetupAction";

const isLoginPage = () => !!document.querySelector('#userName, form[name="Security.LoginForm"]');

async function get(url) {
  const r = await fetch(url, { credentials: "include", headers: { "X-Requested-With": "XMLHttpRequest" } });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.text();
}

async function generate(btn) {
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Mengambil jadual…";
  }
  try {
    const [classHtml, examHtml] = await Promise.all([get(URL_CLASS), get(URL_EXAM).catch(() => "")]);
    if (!classHtml.toUpperCase().includes("MASA KULIAH")) {
      alertBox("Tak dapat jadual kelas. Pastikan kau dah login eSMP, kemudian cuba lagi.");
      return;
    }
    await chrome.storage.local.set({ esmp: { classHtml, examHtml, fetchedAt: Date.now() } });
    await chrome.runtime.sendMessage({ type: "open-app" });
  } catch (e) {
    alertBox("Tak dapat sambung ke eSMP. Semak internet dan cuba lagi.");
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = "Jana Jadual";
    }
  }
}

// Mesej dalam halaman (bukan window.alert, supaya tak sekat halaman).
function alertBox(msg) {
  let box = document.getElementById("jadualku-msg");
  if (!box) {
    box = document.createElement("div");
    box.id = "jadualku-msg";
    box.setAttribute("role", "alert");
    document.body.append(box);
  }
  box.textContent = msg;
  clearTimeout(alertBox.t);
  alertBox.t = setTimeout(() => box.remove(), 6000);
}

function addButton() {
  if (isLoginPage() || document.getElementById("jadualku-btn")) return;
  const btn = document.createElement("button");
  btn.id = "jadualku-btn";
  btn.type = "button";
  btn.textContent = "Jana Jadual";
  btn.title = "JadualKu: jana wallpaper dan .ics dari jadual eSMP kau";
  btn.addEventListener("click", () => generate(btn));
  document.body.append(btn);
}

chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === "generate") generate(document.getElementById("jadualku-btn"));
});

addButton();
