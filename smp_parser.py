"""
smp_parser.py — Tukar HTML jadual SMP-UPM jadi data berstruktur. (v2, robust)

    parse_class_timetable(html) -> list kursus + sesi kuliah/amali
    parse_exam_timetable(html)  -> {is_draft, exams}

Encoding masa UPM:
    <kod_hari><jam_mula>[-<jam_tamat>]
    Kod hari (huruf depan): A=Ahad, I=Isnin, S=Selasa, R=Rabu,
        K=Khamis, J=Jumaat, SA=Sabtu
    Nombor = jam 24-jam terus. 'I08-10' -> Isnin 08:00-10:00.
    Nombor tunggal = 1 jam. 'R08' -> Rabu 08:00-09:00.
"""

import re
from bs4 import BeautifulSoup

DAY_MAP = {
    "A": "Ahad", "I": "Isnin", "S": "Selasa", "R": "Rabu",
    "K": "Khamis", "J": "Jumaat", "SA": "Sabtu", "AH": "Ahad",
}
DAY_NUM = {"Isnin": 1, "Selasa": 2, "Rabu": 3, "Khamis": 4,
           "Jumaat": 5, "Sabtu": 6, "Ahad": 7}

CLASS_HEADERS = ["KOD DAN NAMA KURSUS", "MASA KULIAH"]
EXAM_HEADERS = ["KOD KURSUS", "TARIKH"]


class NoTimetableTable(ValueError):
    """Dilempar bila HTML tak mengandungi table jadual yang dijangka."""


def _find_table(soup, headers):
    cand = soup.find("table", class_="sortablescroll")
    if cand and all(h in cand.get_text().upper() for h in headers):
        return cand
    for t in soup.find_all("table"):
        if all(h in t.get_text().upper() for h in headers):
            return t
    return None


def _data_rows(table):
    body = table.find("tbody") or table
    return [tr for tr in body.find_all("tr", recursive=False) if not tr.find("th")]


def _require_table(soup, headers, what):
    table = _find_table(soup, headers)
    if table is None:
        raise NoTimetableTable(
            f"Tak jumpa table {what} dalam HTML.\n"
            "Kemungkinan kau save PAGE SOURCE (shell 'Loading Core API'), "
            "bukan RESPONSE dari endpoint Ajax.\n"
            "Cara betul: DevTools (F12) -> Network -> klik request "
            "'...AjaxSetupAction' -> tab Response -> copy/save isi tu.\n"
            "Semak: file betul mesti ada perkataan 'sortablescroll' / 'MASA KULIAH'."
        )
    return table


def parse_masa(code):
    out = []
    code = (code or "").strip()
    if not code:
        return out
    for part in re.split(r"[;,/]+", code):
        part = part.strip()
        if not part:
            continue
        m = re.match(r"^([A-Za-z]+)\s*(\d{1,2})(?:-(\d{1,2}))?$", part)
        if not m:
            out.append({"raw": part, "error": "format tak dikenali"})
            continue
        day = DAY_MAP.get(m.group(1).upper(), f"?({m.group(1).upper()})")
        start_h = int(m.group(2))
        end_h = int(m.group(3)) if m.group(3) else start_h + 1
        out.append({
            "day": day, "day_num": DAY_NUM.get(day),
            "start": f"{start_h:02d}:00", "end": f"{end_h:02d}:00", "raw": part,
        })
    return out


def _split_course(text):
    text = re.sub(r"\s+", " ", text).strip()
    m = re.match(r"^([A-Z]{2,4}\d{3,4})\s*-\s*(.*?)(?:\s+(\d+\(\d+\+\d+\)))?$", text)
    return (m.group(1), m.group(2).strip(), m.group(3) or "") if m else (text, "", "")


def parse_class_timetable(html):
    soup = BeautifulSoup(html, "html.parser")
    table = _require_table(soup, CLASS_HEADERS, "jadual kuliah")
    courses, current = [], None
    for tr in _data_rows(table):
        tds = tr.find_all("td", recursive=False)
        if len(tds) < 9:
            continue
        first = tds[0]
        is_continuation = first.has_attr("mergecell") or not first.get_text(strip=True)
        if not is_continuation:
            code, name, credit = _split_course(tds[1].get_text(" ", strip=True))
            current = {
                "code": code, "name": name, "credit": credit,
                "lecture_group": tds[2].get_text(strip=True),
                "practical_group": tds[6].get_text(strip=True),
                "lectures": [], "practicals": [],
            }
            courses.append(current)
        if current is None:
            continue
        venue = tds[5].get_text(" ", strip=True)
        for s in parse_masa(tds[3].get_text(strip=True)):
            s["venue"] = venue
            current["lectures"].append(s)
        lab = tds[8].get_text(" ", strip=True)
        for s in parse_masa(tds[7].get_text(strip=True)):
            s["venue"] = lab
            current["practicals"].append(s)
    return courses


def _iso_date(d):
    m = re.match(r"^(\d{2})/(\d{2})/(\d{4})$", d.strip())
    return f"{m.group(3)}-{m.group(2)}-{m.group(1)}" if m else None


def _exam_time(t):
    m = re.match(r"^(\d{2})(\d{2})-(\d{2})(\d{2})$", t.strip())
    return (f"{m.group(1)}:{m.group(2)}", f"{m.group(3)}:{m.group(4)}") if m else (None, None)


def parse_exam_timetable(html):
    soup = BeautifulSoup(html, "html.parser")
    table = _require_table(soup, EXAM_HEADERS, "jadual peperiksaan")
    is_draft = "DRAFT" in table.get_text().upper()
    exams = []
    for tr in _data_rows(table):
        tds = tr.find_all("td", recursive=False)
        if len(tds) < 8 or not tds[0].get_text(strip=True).isdigit():
            continue
        date_raw, time_raw = tds[3].get_text(strip=True), tds[4].get_text(strip=True)
        if not date_raw or not time_raw:
            continue
        start, end = _exam_time(time_raw)
        exams.append({
            "code": tds[1].get_text(strip=True),
            "group": tds[2].get_text(strip=True),
            "date": _iso_date(date_raw), "start": start, "end": end,
            "venue": tds[5].get_text(" ", strip=True),
            "attendance": tds[6].get_text(strip=True),
        })
    return {"is_draft": is_draft, "exams": exams}


if __name__ == "__main__":
    import sys
    cls_file = sys.argv[1] if len(sys.argv) > 1 else "class_sample.html"
    exm_file = sys.argv[2] if len(sys.argv) > 2 else "exam_sample.html"

    with open(cls_file, encoding="utf-8") as f:
        classes = parse_class_timetable(f.read())
    print("=" * 60, "\nJADUAL KULIAH\n", "=" * 60, sep="")
    for c in classes:
        print(f"\n{c['code']} — {c['name']}  [{c['credit']}]  (kump {c['lecture_group']})")
        for s in c["lectures"]:
            print(f"   kuliah : {s['day']:7} {s['start']}-{s['end']}  @ {s['venue']}")
        for s in c["practicals"]:
            print(f"   amali  : {s['day']:7} {s['start']}-{s['end']}  @ {s['venue']}")

    with open(exm_file, encoding="utf-8") as f:
        exams = parse_exam_timetable(f.read())
    print("\n", "=" * 60, "\nJADUAL PEPERIKSAAN  (draft=", exams["is_draft"], ")\n", "=" * 60, sep="")
    for e in exams["exams"]:
        print(f"   {e['code']:8} {e['date']}  {e['start']}-{e['end']}  @ {e['venue']}")
