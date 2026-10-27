// Tarikh kuliah Program Bacelor, dari Kalendar Akademik UPM 2026/2027 (Senat Bil. 752, 19 Feb 2026):
// https://akademik.upm.edu.my/upload/dokumen/20261002114735KALENDAR_AKADEMIK_BACELOR_2026_2027.pdf
// Kemaskini setiap sesi. `end` = hari terakhir minggu kuliah terakhir.
// `only` pada cuti = cuti negeri; 'serdang' (Selangor) atau 'bintulu' (Sarawak).

export const SEMESTERS = [
  {
    id: "2026/2027-1",
    label: "Semester 1 2026/2027",
    start: "2026-10-05",
    end: "2027-01-17",
    breaks: [["2026-11-09", "2026-11-15", "Cuti pertengahan semester"]],
    holidays: [
      ["2026-12-11", "Hari Keputeraan Sultan Selangor", "serdang"],
      ["2026-12-25", "Krismas"],
      ["2027-01-01", "Tahun Baharu"],
    ],
  },
  {
    id: "2026/2027-2",
    label: "Semester 2 2026/2027",
    start: "2027-03-08",
    end: "2027-06-20",
    breaks: [["2027-05-17", "2027-05-23", "Cuti pertengahan semester"]],
    holidays: [
      ["2027-03-10", "Hari Raya Aidilfitri"],
      ["2027-03-11", "Cuti Hari Raya Aidilfitri"],
      ["2027-05-01", "Hari Pekerja"],
      ["2027-06-01", "Hari Gawai Dayak", "bintulu"],
      ["2027-06-02", "Hari Gawai Dayak (Hari Kedua)", "bintulu"],
      ["2027-06-07", "Hari Keputeraan YDPA"],
    ],
  },
  {
    id: "2026/2027-3",
    label: "Semester 3 2026/2027",
    start: "2027-07-19",
    end: "2027-09-05",
    breaks: [],
    holidays: [
      ["2027-07-22", "Hari Sarawak", "bintulu"],
      ["2027-08-16", "Cuti Maulidur Rasul"],
      ["2027-08-31", "Hari Kebangsaan"],
    ],
  },
];

export const CAMPUSES = { serdang: "Serdang", bintulu: "Bintulu" };

// Semester yang sedang berjalan, atau yang akan datang paling hampir.
export function pickSemester(todayIso) {
  return (
    SEMESTERS.find((s) => todayIso <= s.end) ||
    SEMESTERS[SEMESTERS.length - 1]
  );
}

export function semesterById(id) {
  return SEMESTERS.find((s) => s.id === id) || null;
}
