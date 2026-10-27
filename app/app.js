// UI Student Schedule Generator. Satu halaman untuk tiga mod:
//   extension (laptop) : data dari chrome.storage (diisi oleh ext/content.js)
//   website + #d=...   : data dari QR (phone/iPad)
//   website kosong     : landing + contoh

import { parseClassTimetable, parseExamTimetable, NoTimetableError } from "./core/parse.js";
import { buildModel, findClashes, describeSlot } from "./core/model.js";
import { render, canvasSize, THEMES } from "./core/render.js";
import { buildICS, skippedDates } from "./core/ics.js";
import { SEMESTERS, CAMPUSES, pickSemester, semesterById } from "./core/semesters.js";
import { shareUrl, decodeState } from "./core/share.js";
import { DEMO_COURSES, DEMO_EXAMS } from "./core/demo.js";

const $ = (id) => document.getElementById(id);
const isExt = !!globalThis.chrome?.runtime?.id;
const isPhone = !isExt && matchMedia("(max-width: 860px)").matches;

// ------------------------------------------------------------ simpanan pilihan

const store = {
  async get() {
    try {
      if (isExt) return (await chrome.storage.local.get("prefs")).prefs || {};
      return JSON.parse(localStorage.getItem("jadualku-prefs") || "{}");
    } catch { return {}; }
  },
  async set(p) {
    try {
      if (isExt) await chrome.storage.local.set({ prefs: p });
      else localStorage.setItem("jadualku-prefs", JSON.stringify(p));
    } catch { /* storan disekat: pilihan tak diingat, tapi app tetap jalan */ }
  },
};

// ------------------------------------------------------------ keadaan

const S = {
  model: null,
  exams: null,
  warnings: [],
  title: "jadual kelas",
  theme: "comel",
  device: "iphone",
  orientation: "portrait",
  semesterId: pickSemester(new Date().toISOString().slice(0, 10)).id,
  campus: "serdang",
  custom: { start: "", end: "" },
  shorts: {},
};

function semester() {
  if (S.semesterId === "custom") {
    return { id: "custom", label: "", start: S.custom.start, end: S.custom.end, breaks: [], holidays: [] };
  }
  return semesterById(S.semesterId) || SEMESTERS[0];
}

function savePrefs() {
  const { title, theme, device, orientation, semesterId, campus, custom, shorts } = S;
  store.set({ title, theme, device, orientation, semesterId, campus, custom, shorts });
}

function toast(msg) {
  const t = $("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.remove("show"), 2600);
}

function show(id) {
  for (const v of ["landing", "error", "editor"]) $(v).hidden = v !== id;
}

function fail(msg) {
  $("error-msg").textContent = msg;
  show("error");
}

// ------------------------------------------------------------ muat data

async function loadFromExtension() {
  const { esmp } = await chrome.storage.local.get("esmp");
  if (!esmp) {
    fail("Belum ada jadual. Buka eSMP, login, kemudian tekan butang Jana Jadual.");
    return false;
  }
  let parsed;
  try {
    parsed = parseClassTimetable(esmp.classHtml);
  } catch (e) {
    if (!(e instanceof NoTimetableError)) throw e;
    fail("Respons eSMP bukan jadual kelas. Mungkin sesi login dah tamat. Login semula dan cuba lagi.");
    return false;
  }
  if (!parsed.courses.length) {
    fail("eSMP tak tunjuk sebarang kursus berdaftar untuk semester ni.");
    return false;
  }
  S.model = buildModel(parsed.courses);
  S.warnings = parsed.warnings.map((w) => w.msg);
  try {
    S.exams = parseExamTimetable(esmp.examHtml);
  } catch (e) {
    if (!(e instanceof NoTimetableError)) throw e;
    S.exams = null;
  }
  return true;
}

async function loadFromHash(hash) {
  try {
    const st = await decodeState(hash);
    Object.assign(S, { model: st.model, exams: st.exams, title: st.title || S.title, theme: st.theme || S.theme, campus: st.campus || S.campus });
    if (semesterById(st.semesterId)) S.semesterId = st.semesterId;
    return true;
  } catch {
    fail("Link ni rosak atau tak lengkap. Scan QR sekali lagi dari laptop.");
    return false;
  }
}

function loadDemo() {
  S.model = buildModel(DEMO_COURSES);
  S.exams = DEMO_EXAMS;
  S.warnings = [];
}

function applySavedShorts() {
  for (const s of S.model.subjects) if (S.shorts[s.code]) s.short = S.shorts[s.code];
}

// ------------------------------------------------------------ lukis

let fontsReady = null;
function loadFonts() {
  fontsReady ||= Promise.all([
    document.fonts.load('400 40px "Sacramento"'),
    document.fonts.load('800 40px "Inter"'),
    document.fonts.load('500 40px "Inter"'),
  ]).catch(() => {});
  return fontsReady;
}

function targetSize() {
  if (isPhone) {
    // Ikut skrin sebenar peranti ni supaya wallpaper muat tepat.
    const dpr = devicePixelRatio || 1;
    const a = Math.round(Math.min(screen.width, screen.height) * dpr);
    const b = Math.round(Math.max(screen.width, screen.height) * dpr);
    return S.orientation === "landscape" ? [b, a] : [a, b];
  }
  return canvasSize(S.device, S.orientation);
}

let phoneUrl = null;
async function draw() {
  await loadFonts();
  const c = $("canvas");
  const [w, h] = targetSize();
  c.width = w;
  c.height = h;
  render(c.getContext("2d"), S.model, { theme: S.theme, title: S.title, footer: semester().label });
  $("frame").classList.toggle("landscape", w > h);
  if (isPhone) {
    const blob = await new Promise((r) => c.toBlob(r, "image/png"));
    if (phoneUrl) URL.revokeObjectURL(phoneUrl);
    phoneUrl = URL.createObjectURL(blob);
    $("phone-img").src = phoneUrl;
  }
  $("qr-card").hidden = true;
}

let drawTimer = 0;
function redraw() {
  clearTimeout(drawTimer);
  drawTimer = setTimeout(draw, 60);
}

// ------------------------------------------------------------ kawalan

function segmented(el, options, current, onPick) {
  el.replaceChildren();
  for (const o of options) {
    const b = document.createElement("button");
    b.type = "button";
    b.setAttribute("role", "radio");
    b.setAttribute("aria-checked", String(o.value === current));
    if (o.icon) {
      const i = document.createElement("span");
      i.className = "ico";
      i.style.width = `${o.icon[0]}px`;
      i.style.height = `${o.icon[1]}px`;
      b.append(i);
    }
    b.append(o.label);
    if (o.name) {
      b.setAttribute("aria-label", o.name);
      b.title = o.name;
    }
    b.addEventListener("click", () => {
      for (const x of el.children) x.setAttribute("aria-checked", String(x === b));
      onPick(o.value);
    });
    el.append(b);
  }
}

function buildControls() {
  segmented($("theme"), Object.entries(THEMES).map(([value, t]) => ({ value, label: t.label })), S.theme, (v) => {
    S.theme = v;
    savePrefs();
    renderSubjects();
    redraw();
  });

  if (isPhone) {
    segmented($("size"), [
      { value: "portrait", label: "Menegak", icon: [9, 16] },
      { value: "landscape", label: "Melintang", icon: [16, 9] },
    ], S.orientation, (v) => { S.orientation = v; savePrefs(); redraw(); });
    $("size").classList.remove("seg-4");
  } else {
    const sizes = [
      { value: "iphone-portrait", label: "iPhone", name: "iPhone menegak", icon: [8, 16] },
      { value: "iphone-landscape", label: "iPhone", name: "iPhone melintang", icon: [16, 8] },
      { value: "ipad-portrait", label: "iPad", name: "iPad menegak", icon: [12, 16] },
      { value: "ipad-landscape", label: "iPad", name: "iPad melintang", icon: [16, 12] },
    ];
    segmented($("size"), sizes, `${S.device}-${S.orientation}`, (v) => {
      [S.device, S.orientation] = v.split("-");
      savePrefs();
      redraw();
    });
  }

  $("title").value = S.title;
  $("title").addEventListener("input", (e) => {
    S.title = e.target.value;
    savePrefs();
    redraw();
  });

  $("save-png").textContent = isPhone ? "Simpan gambar" : "Muat turun PNG";
  $("save-png").addEventListener("click", savePng);
  $("to-phone").hidden = isPhone;
  $("to-phone").addEventListener("click", showQr);
  $("copy-link").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(await shareUrl(shareState()));
      toast("Link disalin. Hantar ke diri sendiri kat WhatsApp/Telegram.");
    } catch {
      toast("Tak dapat salin link.");
    }
  });

  const sel = $("semester");
  sel.replaceChildren(...SEMESTERS.map((s) => new Option(s.label, s.id)), new Option("Tarikh sendiri", "custom"));
  sel.value = S.semesterId;
  sel.addEventListener("change", () => { S.semesterId = sel.value; savePrefs(); renderCalendar(); redraw(); });
  const camp = $("campus");
  camp.replaceChildren(...Object.entries(CAMPUSES).map(([v, l]) => new Option(l, v)));
  camp.value = S.campus;
  camp.addEventListener("change", () => { S.campus = camp.value; savePrefs(); renderCalendar(); });
  for (const [id, key] of [["c-start", "start"], ["c-end", "end"]]) {
    $(id).value = S.custom[key];
    $(id).addEventListener("change", (e) => { S.custom[key] = e.target.value; savePrefs(); renderCalendar(); });
  }
  $("save-ics").addEventListener("click", saveIcs);

  $("stage-hint").textContent = isPhone
    ? "Tekan lama gambar dan pilih Simpan ke Foto. Kemudian buka Settings → Wallpaper."
    : "Ruang kosong di atas sengaja ditinggalkan untuk jam lockscreen.";
  $("canvas").hidden = isPhone;
  $("phone-img").hidden = !isPhone;
}

function renderWarnings() {
  const all = [...S.warnings, ...findClashes(S.model).map((c) => c.msg)];
  const box = $("warnings");
  box.hidden = !all.length;
  if (!all.length) return;
  const b = document.createElement("b");
  b.textContent = all.length === 1 ? "Semak 1 perkara sebelum guna:" : `Semak ${all.length} perkara sebelum guna:`;
  const ul = document.createElement("ul");
  for (const m of all) {
    const li = document.createElement("li");
    li.textContent = m;
    ul.append(li);
  }
  box.replaceChildren(b, ul);
}

function renderSubjects() {
  const { subjects, items } = S.model;
  $("subj-count").textContent = `(${subjects.length})`;
  const theme = THEMES[S.theme];
  $("subjects").replaceChildren(...subjects.map((s, i) => {
    const li = document.createElement("li");
    li.className = "subj";
    const dot = document.createElement("span");
    dot.className = "dot";
    dot.style.background = theme.block(s.color);
    const input = document.createElement("input");
    input.className = "input";
    input.value = s.short;
    input.maxLength = 10;
    input.setAttribute("aria-label", `Nama pendek untuk ${s.code}`);
    input.addEventListener("input", () => {
      s.short = input.value.trim() || s.code;
      S.shorts[s.code] = s.short;
      savePrefs();
      redraw();
    });
    const meta = document.createElement("div");
    meta.className = "meta";
    const head = document.createElement("div");
    head.innerHTML = "<b></b> <span></span>";
    head.children[0].textContent = s.code;
    head.children[1].textContent = s.name;
    meta.append(head);
    for (const it of items.filter((x) => x.subject === i)) {
      const d = document.createElement("div");
      d.className = "slots";
      d.textContent = `${it.kind === "amali" ? "Amali" : "Kuliah"}: ${describeSlot(it)}${it.venue ? " · " + it.venue : ""} `;
      if (it.raw) {
        const code = document.createElement("code");
        code.textContent = it.raw;
        code.title = "Seperti tertulis dalam eSMP";
        d.append(code);
      }
      meta.append(d);
    }
    li.append(dot, input, meta);
    return li;
  }));
}

const fmtDate = (iso) => new Intl.DateTimeFormat("ms-MY", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(iso + "T00:00:00Z"));

function renderCalendar() {
  const sem = semester();
  $("custom-dates").hidden = sem.id !== "custom";
  const valid = sem.start && sem.end && sem.start <= sem.end;
  $("save-ics").disabled = !valid;
  if (!valid) {
    $("sem-info").textContent = "Pilih tarikh mula dan tamat kuliah.";
  } else {
    const days = [...new Set(S.model.items.map((i) => i.day))];
    const hol = new Set(days.flatMap((d) => skippedDates(sem, d, S.campus)).filter((d) => sem.holidays.some(([h]) => h === d)));
    const parts = [`Kelas berulang setiap minggu dari ${fmtDate(sem.start)} hingga ${fmtDate(sem.end)}.`];
    const skips = sem.breaks.map(([f, t]) => `cuti pertengahan semester (${fmtDate(f)} – ${fmtDate(t)})`);
    if (hol.size) skips.push(`${hol.size} cuti umum yang jatuh pada hari kelas kau`);
    if (skips.length) parts.push(`Tiada kelas pada ${skips.join(" dan ")}.`);
    $("sem-info").textContent = parts.join(" ");
  }
  const ex = S.exams;
  let msg;
  if (!ex) msg = "Jadual exam tak dapat diambil, jadi exam tak dimasukkan.";
  else if (!ex.exams.length) msg = "Jadual exam belum ada tarikh, jadi exam belum dimasukkan. Muat turun semula selepas jadual exam disahkan dalam eSMP.";
  else {
    msg = `${ex.exams.length} exam dimasukkan.`;
    if (ex.isDraft) msg += " Jadual exam masih DRAFT dan boleh berubah, jadi setiap exam dilabel [DRAFT].";
    if (ex.pending.length) msg += ` Belum ada tarikh: ${ex.pending.join(", ")}.`;
  }
  $("exam-info").textContent = msg;
}

// ------------------------------------------------------------ simpan / kongsi

function download(blob, name) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

async function savePng() {
  const c = $("canvas");
  const blob = await new Promise((r) => c.toBlob(r, "image/png"));
  const name = `jadual-${isPhone ? "wallpaper" : `${S.device}-${S.orientation}`}.png`;
  if (isPhone) {
    const file = new File([blob], name, { type: "image/png" });
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file] });
      } catch (e) {
        if (e.name !== "AbortError") toast("Tak dapat kongsi. Tekan lama gambar untuk simpan.");
      }
      return;
    }
  }
  download(blob, name);
}

function saveIcs() {
  const sem = semester();
  const ics = buildICS({ model: S.model, exams: S.exams, semester: { ...sem, label: sem.label || "Semester" }, campus: S.campus });
  download(new Blob([ics], { type: "text/calendar;charset=utf-8" }), `jadual-${(sem.id || "semester").replace("/", "-")}.ics`);
}

function shareState() {
  return { title: S.title, theme: S.theme, semesterId: S.semesterId, campus: S.campus, model: S.model, exams: S.exams };
}

async function showQr() {
  const url = await shareUrl(shareState());
  const qr = qrcode(0, "L");
  qr.addData(url, "Byte");
  qr.make();
  const n = qr.getModuleCount();
  const scale = 10, quiet = 4; // resolusi tinggi, dikecilkan oleh CSS supaya modul sekata
  const c = $("qr");
  c.width = c.height = (n + quiet * 2) * scale;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.fillStyle = "#000";
  for (let r = 0; r < n; r++) for (let col = 0; col < n; col++) {
    if (qr.isDark(r, col)) ctx.fillRect((col + quiet) * scale, (r + quiet) * scale, scale, scale);
  }
  $("qr-card").hidden = false;
}

// ------------------------------------------------------------ mula

async function startEditor() {
  applySavedShorts();
  buildControls();
  renderWarnings();
  renderSubjects();
  renderCalendar();
  show("editor");
  await draw();
}

async function main() {
  Object.assign(S, await store.get());
  if (!THEMES[S.theme]) S.theme = "comel";
  if (S.semesterId !== "custom" && !semesterById(S.semesterId)) S.semesterId = pickSemester(new Date().toISOString().slice(0, 10)).id;

  if (isExt) {
    if (await loadFromExtension()) await startEditor();
    return;
  }
  const hash = new URLSearchParams(location.hash.slice(1)).get("d");
  if (hash) {
    if (await loadFromHash(hash)) await startEditor();
    return;
  }
  if (location.hash === "#demo") {
    loadDemo();
    await startEditor();
    return;
  }
  show("landing");
  $("demo").addEventListener("click", () => {
    location.hash = "demo";
    loadDemo();
    startEditor();
  });
}

main().catch((e) => {
  console.error(e);
  fail("Ada ralat tak dijangka. Muat semula halaman dan cuba lagi.");
});
