// Tukar kursus yang dah diparse jadi senarai blok untuk dilukis, + amaran pertindihan.

import { DAY_NAMES } from "./parse.js";

const STOP = new Set(["DAN", "DI", "KE", "DARI", "UNTUK", "BAGI", "ATAU", "PADA", "&", "AND", "OF", "THE", "IN", "FOR", "TO"]);

// "STRUKTUR DATA DAN ALGORITMA" -> "SDA"; satu perkataan pendek kekal penuh.
export function autoShort(name, code) {
  const words = (name || "").toUpperCase().split(/[\s\-/,]+/).filter((w) => w && !STOP.has(w));
  if (!words.length) return code;
  if (words.length === 1) return words[0].length <= 8 ? words[0] : code;
  return words.map((w) => w[0]).join("").slice(0, 5);
}

export function fmtTime(min) {
  return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
}

export function describeSlot(s) {
  return `${DAY_NAMES[s.day]} ${fmtTime(s.start)}–${fmtTime(s.end)}`;
}

export function buildModel(courses) {
  const shorts = new Map();
  for (const c of courses) {
    const s = autoShort(c.name, c.code);
    shorts.set(s, (shorts.get(s) || 0) + 1);
  }
  const subjects = courses.map((c, i) => {
    const s = autoShort(c.name, c.code);
    return { code: c.code, name: c.name, credit: c.credit, short: shorts.get(s) > 1 ? c.code : s, color: i };
  });
  const items = [];
  courses.forEach((c, i) => {
    for (const s of c.sessions) {
      items.push({ subject: i, kind: s.kind, day: s.day, start: s.start, end: s.end, venue: s.venue, venueFull: s.venueFull, raw: s.raw });
    }
  });
  return { subjects, items };
}

// Pasangan blok yang bertindih masa pada hari sama.
export function findClashes(model) {
  const out = [];
  const it = model.items;
  for (let a = 0; a < it.length; a++) {
    for (let b = a + 1; b < it.length; b++) {
      const x = it[a], y = it[b];
      if (x.day === y.day && x.start < y.end && y.start < x.end) out.push([x, y]);
    }
  }
  return out.map(([x, y]) => ({
    msg: `Pertindihan ${DAY_NAMES[x.day]}: ${model.subjects[x.subject].code} (${fmtTime(x.start)}–${fmtTime(x.end)}) dan ${model.subjects[y.subject].code} (${fmtTime(y.start)}–${fmtTime(y.end)}).`,
  }));
}
