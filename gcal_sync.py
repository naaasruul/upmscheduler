"""
gcal_sync.py — Push jadual SMP-UPM ke Google Calendar.

Kuliah/amali -> recurring event mingguan (RRULE) sampai habis semester.
Exam        -> single event pada tarikhnya.
Idempotent  -> setiap event ditag 'smp_uid'; re-sync update/delete, tak duplicate.

Mode:
    python gcal_sync.py --dry-run     # bina event dari sample, print je (tiada Google)
    python gcal_sync.py               # scrape live + push ke Google Calendar

Setup Google (untuk mode live) diterangkan dalam mesej chat.
"""

import os
import sys
from datetime import datetime, date, timedelta

from smp_parser import parse_class_timetable, parse_exam_timetable, NoTimetableTable

# ====== CONFIG — GANTI dengan tarikh sebenar dari Kalendar Akademik UPM ======
SEMESTER_START = "2026-10-01"   # hari mula kuliah (mana-mana hari dalam minggu pertama)
SEMESTER_END   = "2027-10-01"   # hari akhir kuliah (recurring berhenti sini)
TIMEZONE       = "Asia/Kuala_Lumpur"
CALENDAR_NAME  = "Jadual UPM"
# ===========================================================================

DAY_NUM = {"Isnin": 1, "Selasa": 2, "Rabu": 3, "Khamis": 4,
           "Jumaat": 5, "Sabtu": 6, "Ahad": 7}


def _first_occurrence(start_date, day_num):
    """Tarikh pertama >= start_date yang jatuh pada hari (day_num: Isnin=1)."""
    py_target = day_num - 1                 # Python: Isnin=0
    delta = (py_target - start_date.weekday()) % 7
    return start_date + timedelta(days=delta)


def _until_utc(end_date):
    """RRULE UNTIL mesti UTC. KL = UTC+8 (takde DST)."""
    local = datetime(end_date.year, end_date.month, end_date.day, 23, 59, 0)
    return (local - timedelta(hours=8)).strftime("%Y%m%dT%H%M%SZ")


def _recurring_event(uid, summary, location, day_num, start_hm, end_hm,
                     sem_start, sem_end, description=""):
    first = _first_occurrence(sem_start, day_num)
    return {
        "summary": summary,
        "location": location,
        "description": description,
        "start": {"dateTime": f"{first.isoformat()}T{start_hm}:00", "timeZone": TIMEZONE},
        "end":   {"dateTime": f"{first.isoformat()}T{end_hm}:00",   "timeZone": TIMEZONE},
        "recurrence": [f"RRULE:FREQ=WEEKLY;UNTIL={_until_utc(sem_end)}"],
        "reminders": {"useDefault": False,
                      "overrides": [{"method": "popup", "minutes": 30}]},
        "extendedProperties": {"private": {"smp_app": "1", "smp_uid": uid}},
    }


def build_lecture_events(courses, sem_start, sem_end):
    out, seen = [], set()
    for c in courses:
        for kind, sessions, group in (("Kuliah", c["lectures"], c.get("lecture_group", "")),
                                      ("Amali", c["practicals"], c.get("practical_group", ""))):
            for s in sessions:
                if not s.get("day_num"):
                    continue
                uid = f"{kind[0]}:{c['code']}:{s['day']}:{s['start']}"
                if uid in seen:     # uid sama dua kali -> event duplicate yang tak pernah dipadam
                    continue
                seen.add(uid)
                summary = f"{c['code']} {kind}" + (f" — {c['name']}" if c['name'] else "")
                out.append(_recurring_event(
                    uid, summary, s["venue"], s["day_num"], s["start"], s["end"],
                    sem_start, sem_end, description=f"Kumpulan: {group}"))
    return out


def build_exam_events(examdata):
    out, seen = [], set()
    draft = examdata.get("is_draft")
    for e in examdata["exams"]:
        if not (e["date"] and e["start"]):
            continue
        uid = f"E:{e['code']}:{e['date']}"
        if uid in seen:
            continue
        seen.add(uid)
        desc = "Kumpulan: " + e.get("group", "")
        if draft:
            desc += "\n(AMARAN: jadual exam masih DRAFT, boleh berubah.)"
        out.append({
            "summary": f"EXAM {e['code']}",
            "location": e["venue"],
            "description": desc,
            "start": {"dateTime": f"{e['date']}T{e['start']}:00", "timeZone": TIMEZONE},
            "end":   {"dateTime": f"{e['date']}T{e['end']}:00",   "timeZone": TIMEZONE},
            "reminders": {"useDefault": False,
                          "overrides": [{"method": "popup", "minutes": 24 * 60}]},
            "extendedProperties": {"private": {"smp_app": "1", "smp_uid": uid}},
        })
    return out


# ---------- Bahagian Google (import lazy supaya --dry-run tak perlu lib Google) ----------
def get_service():
    from google.oauth2.credentials import Credentials
    from google.auth.transport.requests import Request
    from google_auth_oauthlib.flow import InstalledAppFlow
    from googleapiclient.discovery import build

    SCOPES = ["https://www.googleapis.com/auth/calendar"]
    creds = None
    if os.path.exists("token.json"):
        creds = Credentials.from_authorized_user_file("token.json", SCOPES)
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            if not os.path.exists("credentials.json"):
                print("!! credentials.json takde dalam", os.getcwd())
                print("   1. https://console.cloud.google.com -> buat/pilih project")
                print("   2. APIs & Services -> Library -> enable 'Google Calendar API'")
                print("   3. OAuth consent screen -> External, tambah email kau sebagai Test user")
                print("   4. Credentials -> Create credentials -> OAuth client ID -> Desktop app")
                print("   5. Download JSON, rename jadi credentials.json, letak dalam folder ni")
                sys.exit(1)
            flow = InstalledAppFlow.from_client_secrets_file("credentials.json", SCOPES)
            creds = flow.run_local_server(port=0)
        with open("token.json", "w") as f:
            f.write(creds.to_json())
    return build("calendar", "v3", credentials=creds)


def ensure_calendar(service, name):
    page = None
    while True:
        resp = service.calendarList().list(pageToken=page).execute()
        for cal in resp.get("items", []):
            if cal.get("summary") == name:
                return cal["id"]
        page = resp.get("nextPageToken")
        if not page:
            break
    created = service.calendars().insert(body={"summary": name, "timeZone": TIMEZONE}).execute()
    return created["id"]


def _existing_by_uid(service, cal_id):
    out, page = {}, None
    while True:
        resp = service.events().list(
            calendarId=cal_id, privateExtendedProperty="smp_app=1",
            singleEvents=False, showDeleted=False, maxResults=2500, pageToken=page).execute()
        for ev in resp.get("items", []):
            uid = ev.get("extendedProperties", {}).get("private", {}).get("smp_uid")
            if uid:
                out[uid] = ev["id"]
        page = resp.get("nextPageToken")
        if not page:
            break
    return out


def sync(service, cal_id, events, keep_prefixes=()):
    """keep_prefixes: prefix uid yang TAK boleh dipadam (cth 'E:' bila jadual exam gagal diambil)."""
    existing = _existing_by_uid(service, cal_id)
    seen = set()
    created = updated = deleted = 0
    for body in events:
        uid = body["extendedProperties"]["private"]["smp_uid"]
        seen.add(uid)
        if uid in existing:
            service.events().update(calendarId=cal_id, eventId=existing[uid], body=body).execute()
            updated += 1
        else:
            service.events().insert(calendarId=cal_id, body=body).execute()
            created += 1
    for uid, eid in existing.items():
        if uid not in seen and not uid.startswith(tuple(keep_prefixes)):
            service.events().delete(calendarId=cal_id, eventId=eid).execute()
            deleted += 1
    return created, updated, deleted


def main():
    sem_start = date.fromisoformat(SEMESTER_START)
    sem_end = date.fromisoformat(SEMESTER_END)

    if "--dry-run" in sys.argv:
        with open("class_sample.html", encoding="utf-8") as f:
            courses = parse_class_timetable(f.read())
        with open("exam_sample.html", encoding="utf-8") as f:
            exams = parse_exam_timetable(f.read())
    else:
        import smp_scraper as sc
        s = sc.make_session()
        user = os.environ.get("SMP_USER") or input("Username: ").strip()
        import getpass
        pw = os.environ.get("SMP_PASS") or getpass.getpass("Password: ")
        ok, _ = sc.login(s, user, pw)
        if not ok:
            print("Login gagal."); sys.exit(1)
        try:
            courses = parse_class_timetable(sc.fetch(s, sc.URL_CLASS))
        except NoTimetableTable:
            print("!! Jadual kuliah tak dapat diambil — sync dibatalkan, kalendar tak diusik.")
            sys.exit(1)
        try:
            exams = parse_exam_timetable(sc.fetch(s, sc.URL_EXAM))
        except NoTimetableTable:
            print("!! Jadual exam belum ada — event exam sedia ada dikekalkan.")
            exams = None

    keep = ("E:",) if exams is None else ()
    events = build_lecture_events(courses, sem_start, sem_end)
    if exams is not None:
        events += build_exam_events(exams)
    print(f"Jumlah event dibina: {len(events)}")
    if not courses:
        print("!! 0 kursus dijumpai — sync dibatalkan supaya event sedia ada tak dipadam.")
        sys.exit(1)

    if "--dry-run" in sys.argv:
        for ev in events:
            r = ev.get("recurrence", ["(single)"])[0]
            print(f"\n{ev['summary']}")
            print(f"   start: {ev['start']['dateTime']}  end: {ev['end']['dateTime']}")
            print(f"   {r}")
            print(f"   uid: {ev['extendedProperties']['private']['smp_uid']}")
        return

    service = get_service()
    cal_id = ensure_calendar(service, CALENDAR_NAME)
    c, u, d = sync(service, cal_id, events, keep_prefixes=keep)
    print(f"Selesai. Dicipta:{c} Dikemaskini:{u} Dipadam:{d}  -> kalendar '{CALENDAR_NAME}'")


if __name__ == "__main__":
    main()
