"""
smp_scraper.py — Login SMP-UPM, ambil jadual kuliah + peperiksaan, parse jadi data.

Ni pipeline penuh: login -> panggil 2 endpoint Ajax -> parse.
Tak perlu save HTML manual; script yang ambil terus guna session cookie.

Guna:
    pip install requests beautifulsoup4
    # set credential elak hardcode (pilih satu):
    #   PowerShell : $env:SMP_USER="matric"; $env:SMP_PASS="password"
    #   Linux/Mac  : export SMP_USER=matric SMP_PASS=password
    python smp_scraper.py
    # kalau env var takde, dia akan tanya.

Bila run, ia simpan response mentah (kuliah_raw.html, peperiksaan_raw.html,
after_login.html) supaya senang diagnose kalau ada apa-apa pelik.
"""

import os
import sys
import getpass
import requests

from smp_parser import (
    parse_class_timetable, parse_exam_timetable, NoTimetableTable,
)

BASE = "https://esmp.upm.edu.my"
LOGIN_SETUP = f"{BASE}/smp/action/security/loginSmpSetup"
LOGIN_ACTION = f"{BASE}/smp/action/security/loginSmp"
URL_CLASS = f"{BASE}/smp/action/portal/student/MyTimetable/MTT_GetJadualWaktuKuliahPelajar_AjaxSetupAction"
URL_EXAM = f"{BASE}/smp/action/portal/student/MyTimetable/MTT_GetJadualWaktuPeperiksaanPelajar_AjaxSetupAction"

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/120.0 Safari/537.36")


# Server esmp tak hantar sijil intermediate Sectigo (chain tak lengkap). Browser
# boleh cari sendiri, Python tak -> CERTIFICATE_VERIFY_FAILED. Jadi kita tambah
# intermediate tu ke bundle certifi. SSL verification masih penuh, bukan dimatikan.
INTERMEDIATE_PEM = os.path.join(os.path.dirname(os.path.abspath(__file__)), "sectigo_dv_r36.pem")


def _ca_bundle():
    import certifi
    import tempfile
    path = os.path.join(tempfile.gettempdir(), "smp_upm_ca_bundle.pem")
    with open(certifi.where(), encoding="utf-8") as a, open(INTERMEDIATE_PEM, encoding="utf-8") as b:
        bundle = a.read() + "\n" + b.read()
    with open(path, "w", encoding="utf-8") as f:
        f.write(bundle)
    return path


def make_session():
    s = requests.Session()
    s.headers.update({"User-Agent": UA})
    s.verify = _ca_bundle()
    return s


def login(session, username, password):
    session.get(LOGIN_SETUP, timeout=30).raise_for_status()
    payload = {
        "userName": username, "password": password, "device": "PC",
        "butangsubmit.x": "1", "butangsubmit.y": "1",
    }
    r = session.post(LOGIN_ACTION, data=payload, allow_redirects=True, timeout=30)
    r.raise_for_status()
    still_login = ('name="Security.LoginForm"' in r.text) or ('id="userName"' in r.text)
    return (not still_login), r


def fetch(session, url):
    headers = {"X-Requested-With": "XMLHttpRequest", "Referer": BASE + "/smp/"}
    r = session.get(url, headers=headers, timeout=30)
    r.raise_for_status()
    return r.text


def save(name, text):
    with open(name, "w", encoding="utf-8", errors="replace") as f:
        f.write(text)


def main():
    user = os.environ.get("SMP_USER") or input("Username (matric): ").strip()
    pw = os.environ.get("SMP_PASS") or getpass.getpass("Password: ")

    s = make_session()
    print("-> Login ...")
    ok, resp = login(s, user, pw)
    save("after_login.html", resp.text)
    if not ok:
        print("!! Login GAGAL. Tengok after_login.html.")
        print("   Kalau pasti password betul, mungkin detection silap — hantar aku output ni.")
        sys.exit(1)
    print("   Login OK. Cookies:", list(s.cookies.get_dict()))

    targets = [
        ("kuliah", URL_CLASS, parse_class_timetable),
        ("peperiksaan", URL_EXAM, parse_exam_timetable),
    ]
    for label, url, parser in targets:
        print(f"\n-> Ambil jadual {label} ...")
        html = fetch(s, url)
        raw = f"{label}_raw.html"
        save(raw, html)
        try:
            data = parser(html)
        except NoTimetableTable:
            print(f"   !! Response bukan table jadual. Disimpan -> {raw}")
            print("      Snippet:", html[:300].replace("\n", " "))
            print("      -> Hantar aku file ni; mungkin endpoint perlu param TX.")
            continue

        if label == "kuliah":
            print(f"   OK — {len(data)} kursus:")
            for c in data:
                print(f"     {c['code']} {c['name']} (kump {c['lecture_group']})")
                for x in c["lectures"]:
                    print(f"        kuliah {x['day']} {x['start']}-{x['end']} @ {x['venue']}")
                for x in c["practicals"]:
                    print(f"        amali  {x['day']} {x['start']}-{x['end']} @ {x['venue']}")
        else:
            print(f"   OK — draft={data['is_draft']}, {len(data['exams'])} exam berjadual:")
            for e in data["exams"]:
                print(f"     {e['code']} {e['date']} {e['start']}-{e['end']} @ {e['venue']}")


if __name__ == "__main__":
    main()
