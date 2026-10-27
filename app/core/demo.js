// Data contoh untuk butang "Cuba dengan contoh" (bentuk sama seperti output parseClassTimetable).

const k = (day, sh, eh, venue) => ({ kind: "kuliah", day, start: sh * 60, end: eh * 60, venue, venueFull: venue, raw: "" });
const a = (day, sh, eh, venue) => ({ kind: "amali", day, start: sh * 60, end: eh * 60, venue, venueFull: venue, raw: "" });

export const DEMO_COURSES = [
  { code: "CCS3202", name: "STRUKTUR DATA DAN ALGORITMA", credit: "3(3+0)", sessions: [k(2, 8, 9, "A1-04"), k(4, 8, 10, "A3-10")] },
  { code: "CCS3400", name: "PRINSIP PANGKALAN DATA", credit: "3(2+1)", sessions: [k(1, 14, 16, "BK3(FSKTM)"), a(3, 14, 17, "MAK.KP2 FSKTM")] },
  { code: "CND3200", name: "KOMUNIKASI DAN RANGKAIAN KOMPUTER", credit: "3(3+0)", sessions: [k(4, 10, 11, "BK03 KAA"), k(2, 10, 12, "BK3(FSKTM)")] },
  { code: "LPE2503", name: "PENULISAN AKADEMIK", credit: "3(3+0)", sessions: [k(1, 8, 10, "A1-01"), k(3, 8, 9, "A1-01")] },
  { code: "SSW3302", name: "SENI BINA DAN REKA BENTUK PERISIAN", credit: "3(3+0)", sessions: [k(2, 14, 16, "A3-10"), k(4, 12, 13, "A2-06")] },
];

export const DEMO_EXAMS = { isDraft: true, exams: [], pending: DEMO_COURSES.map((c) => c.code) };
