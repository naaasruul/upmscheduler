// Jana fail iCalendar (RFC 5545): kelas = event mingguan sepanjang semester,
// tolak minggu cuti pertengahan + cuti umum; exam = event sekali dengan peringatan sehari awal.

import { fmtTime } from "./model.js";
import { DAY_NAMES } from "./parse.js";

const TZ = "Asia/Kuala_Lumpur";

function addDays(iso, n) {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// ISO weekday Isnin=1..Ahad=7
function weekday(iso) {
  return new Date(iso + "T00:00:00Z").getUTCDay() || 7;
}

function local(iso, min) {
  return `${iso.replace(/-/g, "")}T${fmtTime(min).replace(":", "")}00`;
}

function utcStamp(date) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function esc(s) {
  return String(s ?? "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

// Lipat baris > 75 oktet (UTF-8) seperti diwajibkan RFC 5545.
function fold(line) {
  const enc = new TextEncoder();
  if (enc.encode(line).length <= 75) return line;
  const parts = [];
  let cur = "";
  for (const ch of line) {
    const limit = parts.length ? 74 : 75;
    if (enc.encode(cur + ch).length > limit) {
      parts.push(cur);
      cur = "";
    }
    cur += ch;
  }
  parts.push(cur);
  return parts.join("\r\n ");
}

// Semua tarikh dalam semester yang jatuh pada `day` tapi tiada kelas (minggu cuti / cuti umum).
export function skippedDates(semester, day, campus) {
  const out = [];
  for (const [from, to] of semester.breaks) {
    for (let d = from; d <= to; d = addDays(d, 1)) if (weekday(d) === day) out.push(d);
  }
  for (const [d, , only] of semester.holidays) {
    if (weekday(d) === day && (!only || only === campus)) out.push(d);
  }
  return [...new Set(out)].sort();
}

export function firstDate(semester, day) {
  let d = semester.start;
  while (weekday(d) !== day) d = addDays(d, 1);
  return d;
}

export function buildICS({ model, exams, semester, campus = "serdang", now = new Date() }) {
  const stamp = utcStamp(now);
  // UNTIL mesti UTC: 23:59:59 waktu KL (UTC+8, tiada DST) pada hari akhir semester.
  const until = `${semester.end.replace(/-/g, "")}T155959Z`;
  const L = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Student Schedule Generator//UPM//MS",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${esc("Jadual " + semester.label)}`,
    `X-WR-TIMEZONE:${TZ}`,
    "BEGIN:VTIMEZONE",
    `TZID:${TZ}`,
    "BEGIN:STANDARD",
    "DTSTART:19700101T000000",
    "TZOFFSETFROM:+0800",
    "TZOFFSETTO:+0800",
    "TZNAME:+08",
    "END:STANDARD",
    "END:VTIMEZONE",
  ];

  for (const it of model.items) {
    const sub = model.subjects[it.subject];
    const first = firstDate(semester, it.day);
    const kind = it.kind === "amali" ? "Amali" : "Kuliah";
    L.push(
      "BEGIN:VEVENT",
      `UID:${sub.code}-${it.kind}-${it.day}-${it.start}-${semester.id.replace("/", "")}@jadualku`,
      `DTSTAMP:${stamp}`,
      `SUMMARY:${esc(`${sub.short} ${kind}`)}`,
      `LOCATION:${esc(it.venueFull || it.venue)}`,
      `DESCRIPTION:${esc(`${sub.code} ${sub.name}\n${kind}, ${DAY_NAMES[it.day]} ${fmtTime(it.start)}–${fmtTime(it.end)}`)}`,
      `DTSTART;TZID=${TZ}:${local(first, it.start)}`,
      `DTEND;TZID=${TZ}:${local(first, it.end)}`,
      `RRULE:FREQ=WEEKLY;UNTIL=${until}`,
    );
    const skip = skippedDates(semester, it.day, campus);
    if (skip.length) L.push(`EXDATE;TZID=${TZ}:${skip.map((d) => local(d, it.start)).join(",")}`);
    L.push(
      "BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${esc(sub.short)}`, "TRIGGER:-PT15M", "END:VALARM",
      "END:VEVENT",
    );
  }

  for (const e of exams?.exams || []) {
    const sub = model.subjects.find((s) => s.code === e.code);
    const name = sub ? `${sub.short} (${e.code})` : e.code;
    const note = exams.isDraft ? "\nDRAFT: jadual exam belum muktamad, boleh berubah. Semak eSMP." : "";
    L.push(
      "BEGIN:VEVENT",
      `UID:exam-${e.code}-${e.date}@jadualku`,
      `DTSTAMP:${stamp}`,
      `SUMMARY:${esc(`${exams.isDraft ? "[DRAFT] " : ""}EXAM ${name}`)}`,
      `LOCATION:${esc(e.venue)}`,
      `DESCRIPTION:${esc(`${e.code}${sub ? " " + sub.name : ""}${note}`)}`,
      `DTSTART;TZID=${TZ}:${local(e.date, e.start)}`,
      `DTEND;TZID=${TZ}:${local(e.date, e.end)}`,
      "BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${esc("Exam esok: " + name)}`, "TRIGGER:-P1D", "END:VALARM",
      "END:VEVENT",
    );
  }

  L.push("END:VCALENDAR");
  return L.map(fold).join("\r\n") + "\r\n";
}
