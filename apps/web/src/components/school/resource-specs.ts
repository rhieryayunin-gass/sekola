import type { Field, ResourceSpec } from "./record-workspace";
const text = (key: string, label: string, optional = false): Field => ({ key, label, optional });
const pick = text;
const date = (key: string, label: string, optional = false): Field => ({ key, label, type: "date", optional });
const options = (key: string, label: string, values: string[]): Field => ({ key, label, options: values });
const active: Field = { key: "is_active", label: "Aktif", type: "checkbox" };
const schoolYear = pick("academic_year_id", "Tahun ajaran");
const semester = pick("semester_id", "Semester");
const classroom = pick("classroom_id", "Kelas");
const subject = pick("subject_id", "Mata pelajaran");
const teacher = pick("teacher_id", "Guru");
const student = pick("student_id", "Siswa");
const number = (key: string, label: string, min = 0): Field => ({ key, label, type: "number", min });
export const academicSpecs: ResourceSpec[] = [
 { key: "academic_years", title: "Tahun ajaran", path: "/academic-years", permission: "academic_years", fields: [text("name", "Nama"), date("starts_on", "Mulai"), date("ends_on", "Selesai"), active] },
 { key: "semesters", title: "Semester", path: "/semesters", permission: "semesters", fields: [schoolYear, text("name", "Nama"), date("starts_on", "Mulai"), date("ends_on", "Selesai"), active] },
 { key: "classrooms", title: "Kelas", path: "/classrooms", permission: "classrooms", fields: [schoolYear, text("name", "Nama kelas"), number("capacity", "Kapasitas"), pick("homeroom_teacher_user_id", "Wali kelas", true), active] },
 { key: "subjects", title: "Mata pelajaran", path: "/subjects", permission: "subjects", fields: [text("code", "Kode"), text("name", "Nama"), text("description", "Deskripsi", true), active] },
 { key: "teacher_assignments", title: "Penugasan guru", path: "/teacher-assignments", permission: "teacher_assignments", fields: [schoolYear, semester, classroom, subject, teacher, active] },
 { key: "student_assignments", title: "Penempatan siswa", path: "/student-assignments", permission: "student_assignments", fields: [schoolYear, semester, classroom, student] },
 { key: "school_timetable", title: "Jadwal pelajaran", fields: [semester, classroom, subject, teacher, { ...number("weekday", "Hari (1 Senin – 7 Minggu)", 1), max: 7 }, { key: "starts_at", label: "Jam mulai", type: "time" }, { key: "ends_at", label: "Jam selesai", type: "time" }, pick("room_id", "Ruangan", true)], description: "Benturan kelas, guru, dan ruangan dicegah. Perubahan dikirim ke notifikasi guru, siswa, dan orang tua." },
];
export const peopleSpecs: ResourceSpec[] = [
 { key: "teachers", title: "Guru", path: "/teachers", permission: "teachers", fields: [pick("user_id", "Akun guru"), text("employee_number", "Nomor pegawai", true), options("employment_status", "Status", ["ACTIVE", "INACTIVE"])] },
 { key: "students", title: "Siswa", path: "/students", permission: "students", fields: [pick("user_id", "Akun siswa"), text("student_number", "Nomor induk"), date("admission_date", "Tanggal masuk", true), options("enrollment_status", "Status", ["ACTIVE", "INACTIVE", "GRADUATED", "WITHDRAWN"])] },
 { key: "school_guardians", title: "Orang tua", fields: [pick("parent_user_id", "Akun orang tua"), student, options("relationship", "Hubungan", ["PARENT", "GUARDIAN"])] },
 { key: "school_alumni", title: "Alumni", fields: [pick("student_id", "Siswa asal", true), text("name", "Nama alumni"), { ...number("graduation_year", "Tahun lulus", 1900), max: 2200 }, text("notes", "Catatan", true)], description: "Siswa berstatus GRADUATED tercatat otomatis. Alumni lama dapat ditambahkan manual." },
 { key: "school_assets", title: "Aset sekolah", fields: [text("name", "Nama aset"), options("category", "Jenis", ["CLASSROOM", "LAB", "FIELD", "EQUIPMENT", "OTHER"]), number("capacity", "Kapasitas", 1), pick("room_id", "Ruang pemesanan", true), text("description", "Deskripsi", true), active], description: "Hubungkan aset dengan ruangan untuk pemesanan melalui pusat operasional." },
 { key: "school_canteens", title: "Kantin", fields: [text("name", "Nama kantin"), text("operator_name", "Pengelola", true), text("location", "Lokasi", true), text("opening_hours", "Jam buka", true), active] },
];
export const learningSpecs: ResourceSpec[] = [
 { key: "courses", title: "Courses", path: "/courses", permission: "courses", fields: [schoolYear, semester, classroom, subject, teacher, text("name", "Nama course"), text("description", "Deskripsi", true), active] },
 { key: "lessons", title: "Lessons", path: "/lessons", permission: "lessons", fields: [pick("course_id", "Course"), text("title", "Judul"), { key: "material", label: "Materi", type: "textarea", optional: true }, text("attachment_url", "Tautan materi", true), { key: "scheduled_at", label: "Jadwal", type: "datetime-local", optional: true }, { key: "is_published", label: "Publikasikan", type: "checkbox" }] },
 { key: "assignments", title: "Assignments", path: "/assignments", permission: "assignments", fields: [pick("course_id", "Course"), text("title", "Judul tugas"), { key: "instructions", label: "Instruksi", type: "textarea", optional: true }, { key: "due_at", label: "Batas pengumpulan", type: "datetime-local", optional: true }, number("max_score", "Nilai maksimum", 1), { key: "is_published", label: "Publikasikan", type: "checkbox" }] },
 { key: "submissions", title: "Submissions", path: "/submissions", permission: "submissions", fields: [{ key: "assignment_id", label: "Assignment", catalog: "assignments" }, student, { key: "content", label: "Jawaban", type: "textarea", optional: true }, text("file_url", "Tautan file", true)] },
 { key: "school_library", title: "Perpustakaan digital", fields: [subject, pick("course_id", "Course", true), pick("lesson_id", "Lesson", true), text("title", "Judul"), options("kind", "Jenis", ["PDF", "IMAGE", "DOCUMENT", "YOUTUBE"]), text("url", "Tautan dari pusat media / video YouTube"), { key: "description", label: "Deskripsi", type: "textarea", optional: true }], description: "Unggah PDF, gambar atau dokumen di Pusat Media, lalu pilih materi di sini. Video YouTube dapat ditautkan langsung." },
];
