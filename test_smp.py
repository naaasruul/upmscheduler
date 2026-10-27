"""
test_smp.py — Ujian parser + pembina event (tiada network, tiada Google).

    python -m unittest -v test_smp
"""

import unittest
from datetime import date
from unittest import mock

import gcal_sync
from smp_parser import (
    parse_masa, parse_class_timetable, parse_exam_timetable, NoTimetableTable,
)


def _row(*cells, tag="td"):
    return "<tr>" + "".join(f"<{tag}>{c}</{tag}>" for c in cells) + "</tr>"


CLASS_HEADER = ("BIL", "KOD DAN NAMA KURSUS", "KUMP", "MASA KULIAH", "-",
                "BILIK", "KUMP AMALI", "MASA AMALI", "MAKMAL")


def class_html(header_tag="th", wrap=False):
    t = ("<table class='sortablescroll'><tbody>"
         + _row(*CLASS_HEADER, tag=header_tag)
         + _row("1", "SKR3200 - Algoritma 3(2+1)", "1", "I08-10", "", "BK1", "2", "R14-16", "Lab A")
         + _row("", "", "", "K08", "", "BK2", "", "", "")
         + _row("2", "KOM3101 - Rangkaian 3(3+0)", "3", "S10-12; SA09", "", "DK3", "", "", "")
         + "</tbody></table>")
    if wrap:
        t = "<table><tr><td>" + t.replace("sortablescroll", "x") + "</td></tr></table>"
    return t


EXAM_HTML = ("<table class='sortablescroll'>"
             + _row("BIL", "KOD KURSUS", "KUMP", "TARIKH", "MASA", "TEMPAT", "KEHADIRAN", "-", tag="th")
             + _row("1", "SKR3200", "1", "15/02/2027", "0900-1200", "DEWAN A", "Y", "")
             + _row("2", "KOM3101", "3", "17/02/2027", "14:30-16:30", "DEWAN B", "Y", "")
             + _row("3", "XXX1000", "1", "", "", "", "", "")
             + "<tr><td colspan='8'>DRAFT</td></tr></table>")


class ParseMasa(unittest.TestCase):
    def test_range(self):
        s, = parse_masa("I08-10")
        self.assertEqual((s["day"], s["start"], s["end"]), ("Isnin", "08:00", "10:00"))

    def test_single_hour(self):
        s, = parse_masa("R08")
        self.assertEqual((s["day"], s["end"]), ("Rabu", "09:00"))

    def test_sabtu_not_selasa(self):
        self.assertEqual(parse_masa("SA09")[0]["day"], "Sabtu")
        self.assertEqual(parse_masa("S09")[0]["day"], "Selasa")

    def test_separators(self):
        for code in ("I08-10;R08", "I08-10, R08", "I08-10/R08", "I08-10 R08"):
            self.assertEqual([x["day"] for x in parse_masa(code)], ["Isnin", "Rabu"], code)

    def test_space_inside_slot(self):
        s, = parse_masa("SA 9 - 11")
        self.assertEqual((s["day"], s["start"], s["end"]), ("Sabtu", "09:00", "11:00"))

    def test_empty_and_garbage(self):
        self.assertEqual(parse_masa(""), [])
        self.assertEqual(parse_masa(None), [])
        self.assertIn("error", parse_masa("TBA")[0])


class ClassTimetable(unittest.TestCase):
    def check(self, html):
        c1, c2 = parse_class_timetable(html)
        self.assertEqual((c1["code"], c1["name"], c1["credit"]), ("SKR3200", "Algoritma", "3(2+1)"))
        self.assertEqual([(x["day"], x["venue"]) for x in c1["lectures"]],
                         [("Isnin", "BK1"), ("Khamis", "BK2")])
        self.assertEqual([(x["day"], x["venue"]) for x in c1["practicals"]], [("Rabu", "Lab A")])
        self.assertEqual(c1["practical_group"], "2")
        self.assertEqual([x["day"] for x in c2["lectures"]], ["Selasa", "Sabtu"])

    def test_th_header(self):
        self.check(class_html("th"))

    def test_td_header_not_a_course(self):
        self.check(class_html("td"))

    def test_nested_layout_table(self):
        self.check(class_html("td", wrap=True))

    def test_shell_page_raises(self):
        with self.assertRaises(NoTimetableTable):
            parse_class_timetable("<html><body>Loading Core API</body></html>")


class ExamTimetable(unittest.TestCase):
    def test_parse(self):
        d = parse_exam_timetable(EXAM_HTML)
        self.assertTrue(d["is_draft"])
        self.assertEqual([(e["code"], e["date"], e["start"], e["end"]) for e in d["exams"]],
                         [("SKR3200", "2027-02-15", "09:00", "12:00"),
                          ("KOM3101", "2027-02-17", "14:30", "16:30")])


class BuildEvents(unittest.TestCase):
    SEM = (date(2026, 10, 1), date(2027, 2, 5))   # 1 Okt 2026 = Khamis

    def test_lecture_events(self):
        evs = gcal_sync.build_lecture_events(parse_class_timetable(class_html()), *self.SEM)
        by_uid = {e["extendedProperties"]["private"]["smp_uid"]: e for e in evs}
        isnin = by_uid["K:SKR3200:Isnin:08:00"]
        self.assertEqual(isnin["start"]["dateTime"], "2026-10-05T08:00:00")
        self.assertEqual(isnin["recurrence"], ["RRULE:FREQ=WEEKLY;UNTIL=20270205T155900Z"])
        self.assertEqual(by_uid["K:SKR3200:Khamis:08:00"]["start"]["dateTime"], "2026-10-01T08:00:00")
        self.assertEqual(by_uid["A:SKR3200:Rabu:14:00"]["description"], "Kumpulan: 2")

    def test_duplicate_uid_dropped(self):
        course = {"code": "X100", "name": "", "lecture_group": "1", "practical_group": "",
                  "lectures": parse_masa("I08") * 2, "practicals": []}
        for s in course["lectures"]:
            s["venue"] = "V"
        self.assertEqual(len(gcal_sync.build_lecture_events([course], *self.SEM)), 1)

    def test_exam_events(self):
        evs = gcal_sync.build_exam_events(parse_exam_timetable(EXAM_HTML))
        self.assertEqual(len(evs), 2)
        self.assertIn("DRAFT", evs[0]["description"])
        self.assertEqual(evs[1]["end"]["dateTime"], "2027-02-17T16:30:00")


class Sync(unittest.TestCase):
    def test_keep_prefixes(self):
        svc = mock.MagicMock()
        existing = {"K:A:Isnin:08:00": "e1", "K:OLD:Rabu:08:00": "e2", "E:A:2027-02-15": "e3"}
        new = [{"extendedProperties": {"private": {"smp_uid": "K:A:Isnin:08:00"}}},
               {"extendedProperties": {"private": {"smp_uid": "K:NEW:Jumaat:08:00"}}}]
        with mock.patch.object(gcal_sync, "_existing_by_uid", return_value=existing):
            c, u, d = gcal_sync.sync(svc, "cal", new, keep_prefixes=("E:",))
        self.assertEqual((c, u, d), (1, 1, 1))
        svc.events().delete.assert_called_once_with(calendarId="cal", eventId="e2")


if __name__ == "__main__":
    unittest.main()
