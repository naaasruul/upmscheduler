// Parser respons Ajax eSMP -> data berstruktur.
// Berasaskan string (tanpa DOM) supaya hasil sama dalam extension, website dan ujian Node.
// HTML eSMP tak kemas (<th> ditutup dengan </td>), jadi sel dipotong pada tag sel/baris seterusnya.

export const DAY_CODES = { I: 1, S: 2, R: 3, K: 4, J: 5, SA: 6, A: 7, AH: 7 };
export const DAY_NAMES = ["", "Isnin", "Selasa", "Rabu", "Khamis", "Jumaat", "Sabtu", "Ahad"];

export class NoTimetableError extends Error {}

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

function decode(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === "#") {
      const n = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

function text(html) {
  return decode(html.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
}

function findTable(html, headers) {
  for (const m of html.matchAll(/<table\b[^>]*>([\s\S]*?)<\/table>/gi)) {
    const t = text(m[1]).toUpperCase();
    if (headers.every((h) => t.includes(h))) return m[1];
  }
  return null;
}

// Pulangkan baris sebagai [{isHeader, cells:[{attrs, html, text}]}]
function rows(tableHtml) {
  const out = [];
  for (const chunk of tableHtml.split(/<tr\b[^>]*>/i).slice(1)) {
    const cells = [];
    const re = /<(td|th)\b([^>]*)>([\s\S]*?)(?=<\/?(?:td|th|tr|tbody|thead|table)\b|$)/gi;
    let isHeader = false;
    for (const m of chunk.matchAll(re)) {
      if (m[1].toLowerCase() === "th") isHeader = true;
      cells.push({ attrs: m[2], html: m[3], text: text(m[3]) });
    }
    if (cells.length) out.push({ isHeader, cells });
  }
  return out;
}

function requireTable(html, headers, what) {
  const t = findTable(html || "", headers);
  if (t === null) {
    throw new NoTimetableError(`Tak jumpa jadual ${what}. Pastikan dah login eSMP.`);
  }
  return t;
}

// 'I08-10' -> Isnin 08:00-10:00 (jam tamat tak termasuk). 'R08' -> 1 jam.
// Masa dalam minit dari tengah malam.
export function parseMasa(code) {
  const slots = [], errors = [];
  const src = (code || "").trim();
  if (!src) return { slots, errors };
  for (let part of src.split(/[;,/]+|\s+(?=[A-Za-z])/)) {
    part = part.trim();
    if (!part) continue;
    const m = part.match(/^([A-Za-z]+)\s*(\d{1,2})(?:\s*-\s*(\d{1,2}))?$/);
    const day = m && DAY_CODES[m[1].toUpperCase()];
    const sh = m && +m[2];
    const eh = m && (m[3] ? +m[3] : sh + 1);
    if (!m || !day || sh > 23 || eh > 24 || eh <= sh) {
      errors.push(part);
      continue;
    }
    slots.push({ day, start: sh * 60, end: eh * 60, raw: part });
  }
  return { slots, errors };
}

function splitCourse(s) {
  const m = s.match(/^([A-Z]{2,4}\d{3,4})\s*-\s*(.*?)(?:\s+(\d+\(\d+\+\d+\)))?$/);
  return m ? { code: m[1], name: m[2].trim(), credit: m[3] || "" } : { code: s, name: "", credit: "" };
}

// "A1-04 - BILIK KULIAH AKADEMIK PUSAT (A1-04)" -> "A1-04"
export function shortVenue(v) {
  const head = (v || "").split(" - ")[0].trim();
  return head === "-" ? "" : head;
}

export function parseClassTimetable(html) {
  const table = requireTable(html, ["KOD DAN NAMA KURSUS", "MASA KULIAH"], "kuliah");
  const courses = [], warnings = [];
  let cur = null;
  for (const { isHeader, cells } of rows(table)) {
    if (isHeader || cells.length < 9) continue;
    const first = cells[0];
    const cont = /\bmergecell\b/i.test(first.attrs) || !first.text;
    if (!cont && !/^\d+$/.test(first.text)) continue; // baris header guna <td>
    if (!cont) {
      cur = {
        ...splitCourse(cells[1].text),
        lectureGroup: cells[2].text,
        practicalGroup: cells[6].text,
        sessions: [],
      };
      courses.push(cur);
    }
    if (!cur) continue;
    for (const [kind, masa, venue] of [["kuliah", 3, 5], ["amali", 7, 8]]) {
      const { slots, errors } = parseMasa(cells[masa].text);
      const v = cells[venue].text;
      for (const s of slots) cur.sessions.push({ kind, ...s, venue: shortVenue(v), venueFull: v });
      for (const raw of errors) {
        warnings.push({ code: cur.code, msg: `Masa ${kind} "${raw}" untuk ${cur.code} tak dapat dibaca, jadi tak dimasukkan.` });
      }
    }
  }
  for (const c of courses) {
    const m = c.credit.match(/\((\d+)\+(\d+)\)/);
    if (!m) continue;
    const hours = c.sessions.filter((s) => s.kind === "kuliah").reduce((a, s) => a + (s.end - s.start) / 60, 0);
    if (+m[1] > 0 && hours !== +m[1]) {
      warnings.push({
        code: c.code,
        msg: `${c.code} ada ${hours} jam kuliah seminggu, tapi kredit ${c.credit} biasanya ${m[1]} jam. Semak dengan eSMP.`,
      });
    }
  }
  return { courses, warnings };
}

function isoDate(d) {
  const m = d.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` : null;
}

// '0900-1200', '9:00-12:00', '9.00 - 12.00' -> [540, 720]
function examTime(t) {
  const m = t.match(/^(\d{1,2})[:.]?(\d{2})\s*-\s*(\d{1,2})[:.]?(\d{2})$/);
  return m ? [+m[1] * 60 + +m[2], +m[3] * 60 + +m[4]] : null;
}

export function parseExamTimetable(html) {
  const table = requireTable(html, ["KOD KURSUS", "TARIKH"], "peperiksaan");
  const isDraft = text(table).toUpperCase().includes("DRAFT");
  const exams = [], pending = [];
  for (const { isHeader, cells } of rows(table)) {
    if (isHeader || cells.length < 8 || !/^\d+$/.test(cells[0].text)) continue;
    const code = cells[1].text;
    const date = isoDate(cells[3].text);
    const time = examTime(cells[4].text);
    if (!date || !time) {
      pending.push(code);
      continue;
    }
    exams.push({ code, group: cells[2].text, date, start: time[0], end: time[1], venue: shortVenue(cells[5].text) });
  }
  return { isDraft, exams, pending };
}
