/** School-editable starters; no provider syllabus content or universal grade boundaries. */
export type CurriculumStage = { code: string; name: string; grade_from?: number; grade_to?: number };
const stages = (...names: string[]): CurriculumStage[] => names.map((name, index) => ({ code: String(index + 1), name }));
const framework = (code: string, name: string, source: string, names: string[] = []) => ({ code, name, source, stages: stages(...names) });
export const curriculumFrameworks = [
 { ...framework("MERDEKA", "Kurikulum Merdeka", "https://guru.kemendikdasmen.go.id/kurikulum/referensi-penerapan/capaian-pembelajaran/"), stages: [
 { code: "FOUNDATION", name: "Fase Fondasi" }, ...[["A", 1, 2], ["B", 3, 4], ["C", 5, 6], ["D", 7, 9], ["E", 10, 10], ["F", 11, 13]].map(([code, from, to]) => ({ code: String(code), name: `Fase ${code}`, grade_from: Number(from), grade_to: Number(to) })) ] },
 framework("K13", "Kurikulum 2013", "https://kurikulum.kemendikdasmen.go.id/", ["SD / MI", "SMP / MTs", "SMA / SMK / MA"]),
 framework("CAMBRIDGE", "Cambridge Pathway", "https://www.cambridgeinternational.org/programmes-and-qualifications/", ["Early Years", "Primary", "Lower Secondary", "Upper Secondary — IGCSE / O Level", "Advanced — AS & A Level"]),
 framework("IB_PYP", "IB Primary Years Programme", "https://ibo.org/programmes/primary-years-programme/curriculum/", ["PYP"]),
 framework("IB_MYP", "IB Middle Years Programme", "https://ibo.org/programmes/middle-years-programme/assessment-and-exams/", ["MYP 1", "MYP 2", "MYP 3", "MYP 4", "MYP 5"]),
 framework("IB_DP", "IB Diploma Programme", "https://ibo.org/programmes/diploma-programme/assessment-and-exams/", ["DP 1", "DP 2"]),
 framework("IB_CP", "IB Career-related Programme", "https://ibo.org/programmes/career-related-programme/", ["CP"]),
 framework("EDEXCEL", "Pearson", "https://qualifications.pearson.com/en/qualifications/edexcel-international-gcses.html", ["iPrimary", "iLowerSecondary", "International GCSE", "International Advanced Level"]),
 framework("SIT", "Sekolah Islam Terpadu / pengayaan", "", ["PAUD", "SD", "SMP", "SMA"]),
 framework("IEYC", "International Early Years Curriculum", "https://internationalcurriculum.com/", ["Early Years"]),
 framework("IPC", "International Primary Curriculum", "https://internationalcurriculum.com/"),
 framework("IMYC", "International Middle Years Curriculum", "https://internationalcurriculum.com/"),
 framework("MONTESSORI", "Montessori", "https://montessori-ami.org/about-montessori"),
 framework("SINGAPORE", "Singapore-based", "https://www.moe.gov.sg/education-in-sg/our-programmes"),
 framework("US_STANDARDS", "US / state standards", ""),
 framework("AP", "Advanced Placement", "https://apcentral.collegeboard.org/courses", ["AP"]),
 framework("AUSTRALIAN", "Australian Curriculum", "https://www.australiancurriculum.edu.au/"),
 framework("MADRASAH", "Madrasah / religious programme", "https://kebumen.kemenag.go.id/kakankemenag-kebumen-kma-1503-perkuat-deep-learning-dan-nilai-cinta-di-madrasah/", ["RA", "MI", "MTs", "MA / MAK"]),
 framework("SCHOOL", "School-developed / blended", ""),
];
