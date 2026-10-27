import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { parseMasa, parseClassTimetable, parseExamTimetable, NoTimetableError, shortVenue } from "../app/core/parse.js";
import { buildModel, autoShort, findClashes } from "../app/core/model.js";
import { computeLayout, canvasSize } from "../app/core/render.js";
import { buildICS, skippedDates, firstDate } from "../app/core/ics.js";
import { SEMESTERS, pickSemester, semesterById } from "../app/core/semesters.js";
import { encodeState, decodeState } from "../app/core/share.js";

const fx = (n) => readFileSync(new URL(`./fixtures/${n}`, import.meta.url), "utf8");
const KULIAH = fx("kuliah.html");
const EXAM = fx("peperiksaan.html");
// Versi muktamad rekaan: isi tarikh/masa pada baris pertama & buang notis DRAFT.
const EXAM_FINAL = EXAM
  .replace(/(<td>CCS3400<\/td><td align=center>11<\/td>)<td align=center><\/td><td align=center><\/td><td> - <\/td>/,
    "$1<td align=center>25/01/2027</td><td align=center>0900-1200</td><td>DEWAN BESAR - DEWAN BESAR UPM</td>")
  .replace(/JADUAL WAKTU PEPERIKSAAN YANG DIPAPARKAN ADALAH DALAM BENTUK DRAFT[^<]*/, "");

const sem1 = semesterById("2026/2027-1");

test("parseMasa: format eSMP", () => {
  assert.deepEqual(parseMasa("K08-10").slots, [{ day: 4, start: 480, end: 600, raw: "K08-10" }]);
  assert.equal(parseMasa("R08").slots[0].end, 540);
  assert.equal(parseMasa("SA09").slots[0].day, 6);
  assert.equal(parseMasa("S09").slots[0].day, 2);
  assert.deepEqual(parseMasa("I08-10 R08").slots.map((s) => s.day), [1, 3]);
  assert.deepEqual(parseMasa("I08-10;R08").slots.map((s) => s.day), [1, 3]);
  assert.deepEqual(parseMasa("TBA").errors, ["TBA"]);
  assert.deepEqual(parseMasa("I10-08").errors, ["I10-08"]);
  assert.deepEqual(parseMasa("X08").errors, ["X08"]);
});

test("jadual kuliah sebenar eSMP: semua kursus & sesi betul", () => {
  const { courses, warnings } = parseClassTimetable(KULIAH);
  assert.deepEqual(warnings, []);
  const brief = courses.map((c) => [c.code, c.credit, c.sessions.map((s) => `${s.kind[0]}${s.raw}@${s.venue}`)]);
  assert.deepEqual(brief, [
    ["CCS3202", "3(3+0)", ["kS08@A1-04", "kK08-10@A3-10"]],
    ["CCS3400", "3(2+1)", ["kI14-16@BK3(FSKTM)", "aR14-17@MAK.KP2 FSKTM"]],
    ["CND3200", "3(3+0)", ["kK10@BK03 KAA", "kS10-12@BK3(FSKTM)"]],
    ["LPE2503", "3(3+0)", ["kI08-10@A1-01", "kR08@A1-01"]],
    ["SSW3302", "3(3+0)", ["kS14-16@A3-10", "kK12@A2-06"]],
  ]);
  assert.equal(courses[1].name, "PRINSIP PANGKALAN DATA");
  assert.equal(courses[1].practicalGroup, "12");
});

test("amaran: slot tak dibaca & jam tak padan kredit", () => {
  const html = KULIAH.replace("<td>S08</td>", "<td>TBA</td>");
  const { warnings } = parseClassTimetable(html);
  const msgs = warnings.map((w) => w.msg).join("\n");
  assert.match(msgs, /"TBA" untuk CCS3202 tak dapat dibaca/);
  assert.match(msgs, /CCS3202 ada 2 jam kuliah seminggu, tapi kredit 3\(3\+0\)/);
});

test("halaman bukan jadual -> NoTimetableError", () => {
  assert.throws(() => parseClassTimetable("<html>Loading Core API</html>"), NoTimetableError);
  assert.throws(() => parseExamTimetable(""), NoTimetableError);
});

test("jadual exam sebenar: DRAFT, belum ada tarikh", () => {
  const e = parseExamTimetable(EXAM);
  assert.equal(e.isDraft, true);
  assert.deepEqual(e.exams, []);
  assert.deepEqual(e.pending, ["CCS3400", "SSW3302", "LPE2503", "CCS3202", "CND3200"]);
});

test("jadual exam muktamad", () => {
  const e = parseExamTimetable(EXAM_FINAL);
  assert.equal(e.isDraft, false);
  assert.deepEqual(e.exams, [{ code: "CCS3400", group: "11", date: "2027-01-25", start: 540, end: 720, venue: "DEWAN BESAR" }]);
  assert.equal(e.pending.length, 4);
});

test("nama pendek & tempat pendek", () => {
  assert.equal(autoShort("STRUKTUR DATA DAN ALGORITMA", "CCS3202"), "SDA");
  assert.equal(autoShort("BIOLOGI", "BIO3000"), "BIOLOGI");
  assert.equal(autoShort("", "XYZ1000"), "XYZ1000");
  assert.equal(shortVenue("BK03 KAA - BILIK KULIAH 3, KOMPLEKS AKADEMIK A"), "BK03 KAA");
  assert.equal(shortVenue(" - "), "");
  const m = buildModel(parseClassTimetable(KULIAH).courses);
  assert.deepEqual(m.subjects.map((s) => s.short), ["SDA", "PPD", "KRK", "PA", "SBRBP"]);
  // nama pendek sama -> guna kod kursus supaya tak mengelirukan
  const dup = buildModel([
    { code: "AAA1000", name: "SAINS DATA", sessions: [] },
    { code: "BBB1000", name: "SISTEM DIGITAL", sessions: [] },
  ]);
  assert.deepEqual(dup.subjects.map((s) => s.short), ["AAA1000", "BBB1000"]);
});

test("pertindihan dikesan & dilukis dalam lorong berasingan", () => {
  const m = buildModel(parseClassTimetable(KULIAH).courses);
  assert.deepEqual(findClashes(m), []);
  m.items.push({ subject: 0, kind: "kuliah", day: 1, start: 540, end: 600, venue: "X" }); // Isnin 9-10, tindih LPE 8-10
  assert.equal(findClashes(m).length, 1);
  const L = computeLayout(m, ...canvasSize("iphone", "portrait"));
  const mon = L.blocks.filter((b) => b.item.day === 1 && b.item.start < 600);
  assert.equal(mon.length, 2);
  assert.ok(mon.every((b) => b.clash));
  assert.ok(mon[0].x + mon[0].w <= mon[1].x + 0.01 || mon[1].x + mon[1].w <= mon[0].x + 0.01);
});

test("layout: julat jam, hari, zon selamat & semua blok dalam kanvas", () => {
  const m = buildModel(parseClassTimetable(KULIAH).courses);
  for (const dev of ["iphone", "ipad"]) {
    for (const o of ["portrait", "landscape"]) {
      const [w, h] = canvasSize(dev, o);
      const L = computeLayout(m, w, h);
      assert.deepEqual(L.days, [1, 2, 3, 4, 5]);
      assert.equal(L.startH, 8);
      assert.equal(L.endH, 17);
      assert.equal(L.blocks.length, 10);
      for (const b of L.blocks) {
        assert.ok(b.x >= 0 && b.y >= L.titleTop && b.x + b.w <= w && b.y + b.h <= h * (1 - L.safe.bottom), `${dev}-${o}`);
        assert.ok(b.w > 0 && b.h > 0);
      }
    }
  }
  const sat = buildModel([{ code: "A", name: "X", sessions: [{ kind: "kuliah", day: 6, start: 480, end: 540 }] }]);
  assert.deepEqual(computeLayout(sat, 1179, 2556).days, [1, 2, 3, 4, 5, 6]);
});

test("semester: pilih yang betul & tarikh pertama", () => {
  assert.equal(pickSemester("2026-10-27").id, "2026/2027-1");
  assert.equal(pickSemester("2027-02-10").id, "2026/2027-2");
  assert.equal(pickSemester("2030-01-01").id, SEMESTERS.at(-1).id);
  assert.equal(firstDate(sem1, 1), "2026-10-05");
  assert.equal(firstDate(sem1, 4), "2026-10-08");
});

test("tarikh tanpa kelas: minggu cuti + cuti umum ikut kampus", () => {
  assert.deepEqual(skippedDates(sem1, 1, "serdang"), ["2026-11-09"]);
  assert.deepEqual(skippedDates(sem1, 5, "serdang"), ["2026-11-13", "2026-12-11", "2026-12-25", "2027-01-01"]);
  assert.deepEqual(skippedDates(sem1, 5, "bintulu"), ["2026-11-13", "2026-12-25", "2027-01-01"]);
});

test("ICS: struktur sah, RRULE, EXDATE, exam & baris dilipat", () => {
  const m = buildModel(parseClassTimetable(KULIAH).courses);
  const exams = parseExamTimetable(EXAM_FINAL);
  const ics = buildICS({ model: m, exams, semester: sem1, now: new Date("2026-10-27T00:00:00Z") });
  const lines = ics.split("\r\n");
  assert.equal(lines[0], "BEGIN:VCALENDAR");
  assert.equal(lines.at(-2), "END:VCALENDAR");
  assert.equal(lines.filter((l) => l === "BEGIN:VEVENT").length, 11);
  assert.ok(lines.every((l) => new TextEncoder().encode(l).length <= 75));
  const unfolded = ics.replace(/\r\n /g, "");
  // LPE2503 Isnin 08-10: mula 5 Okt, langkau Isnin minggu cuti
  assert.match(unfolded, /SUMMARY:PA Kuliah\r\nLOCATION:A1-01 - BILIK KULIAH AKADEMIK PUSAT \(A1-01\)\r\nDESCRIPTION:LPE2503 PENULISAN AKADEMIK\\nKuliah\\, Isnin 08:00–10:00\r\nDTSTART;TZID=Asia\/Kuala_Lumpur:20261005T080000\r\nDTEND;TZID=Asia\/Kuala_Lumpur:20261005T100000\r\nRRULE:FREQ=WEEKLY;UNTIL=20270117T155959Z\r\nEXDATE;TZID=Asia\/Kuala_Lumpur:20261109T080000/);
  assert.match(unfolded, /SUMMARY:EXAM PPD \(CCS3400\)/);
  assert.match(unfolded, /DTSTART;TZID=Asia\/Kuala_Lumpur:20270125T090000/);
  assert.match(unfolded, /TRIGGER:-P1D/);
  const draft = buildICS({ model: m, exams: { ...exams, isDraft: true }, semester: sem1 }).replace(/\r\n /g, "");
  assert.match(draft, /SUMMARY:\[DRAFT\] EXAM/);
});

test("share: encode/decode pulih data yang sama & muat dalam QR", async () => {
  const model = buildModel(parseClassTimetable(KULIAH).courses);
  const st = { title: "jadual kelas", theme: "comel", semesterId: sem1.id, campus: "serdang", model, exams: parseExamTimetable(EXAM_FINAL) };
  const enc = await encodeState(st);
  assert.match(enc, /^[A-Za-z0-9_-]+$/);
  assert.ok(enc.length < 1200, `payload ${enc.length} aksara`);
  const back = await decodeState(enc);
  assert.deepEqual(back.model.subjects, model.subjects.map(({ code, name, short, color }) => ({ code, name, short, color })));
  assert.deepEqual(back.model.items.map((i) => [i.day, i.start, i.end, i.venue, i.kind]), model.items.map((i) => [i.day, i.start, i.end, i.venue, i.kind]));
  assert.equal(back.exams.exams[0].date, "2027-01-25");
});
