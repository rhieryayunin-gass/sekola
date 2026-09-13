# Enhancement Part 4 — curriculum and access design

Requested scope: multi-curriculum schools, Academic for STAFF/TEACHER, Learning and Exam for TEACHER/STUDENT, and the explicit directional O-Connect matrix. Previous BUSINESS DEVELOPMENT context called for national, international, religious and school-developed programmes, including multiple programmes for one learner. This release implements that as separate school programme records and mappings.

## Source review (13 September 2026)

| Framework | Consequence for OSEKOLA | Primary reference |
| --- | --- | --- |
| Merdeka | Store phase-level CP, child TP and ordered learning goals. A class/semester is a delivery grouping, not a replacement for a phase. Keep activity type separate from outcome type. | [Official CP explanation](https://pusatinformasi.rumahpendidikan.kemendikdasmen.go.id/hc/id/articles/52513313951257-Pengertian-Capaian-Pembelajaran-CP), [TP/ATP guidance](https://pusatinformasi.rumahpendidikan.kemendikdasmen.go.id/hc/id/articles/52513306767897-Perumusan-Tujuan-Pembelajaran-TP-dan-Penyusunan-Alur-Tujuan-Pembelajaran-ATP) |
| National policy / K13 | Do not rename every school curriculum to a supposed new 2025 curriculum. Support versioned K13 and Merdeka implementations; deep learning is a pedagogical approach, not a substitute programme identifier. | [Kemendikdasmen explanation of Regulation 13/2025](https://www.kemendikdasmen.go.id/siaran-pers/13278-permendikdasmen-nomor-13-tahun-2025-menguatkan-arah-kebijakan-melalui-pembelajaran-mendalam) |
| Cambridge | Five Pathway stages; schools may choose programmes. Programme subject records carry syllabus code, examination-year edition and level, separate from a school's subject name. | [Cambridge Pathway](https://www.cambridgeinternational.org/programmes-and-qualifications/), [Mathematics 0580 editions](https://www.cambridgeinternational.org/programmes-and-qualifications/cambridge-igcse-mathematics-0580/) |
| Cambridge assessment | Keep school rubric marks, external grade labels and raw O-Exam percentages distinct. Do not manufacture a universal percentage-to-A* conversion; grading choices and thresholds depend on the relevant qualification/series. | [IGCSE grading choice](https://www.cambridgeinternational.org/programmes-and-qualifications/cambridge-upper-secondary/cambridge-igcse/grading-choice/), [Grade thresholds](https://www.cambridgeinternational.org/programmes-and-qualifications/cambridge-upper-secondary/cambridge-igcse/grade-threshold-tables/) |
| IB PYP | Inquiry can cross conventional subject boundaries. Schools can register a transdisciplinary subject/unit and map its outcomes across courses; narrative evidence is supported. | [PYP framework](https://ibo.org/programmes/primary-years-programme/curriculum/) |
| IB MYP | Store objectives and assessment criteria separately from tasks. Teacher assessment and optional external eAssessment are different evidence sources. | [MYP assessment](https://ibo.org/programmes/middle-years-programme/assessment-and-exams/) |
| IB DP / CP | Allow subject levels and separate programme components. DP uses internal and external assessment; CP combines DP courses, core and career-related study. A school can attach both programmes to a learner without duplicating their user account. | [DP assessment](https://ibo.org/programmes/diploma-programme/assessment-and-exams/), [CP curriculum](https://ibo.org/programmes/career-related-programme/curriculum/) |
| Pearson Edexcel | Preserve qualification/subject specification and version. Linear and modular assessment options cannot be inferred from the word “international”. | [Pearson International GCSE](https://qualifications.pearson.com/en/qualifications/edexcel-international-gcses.html) |
| Madrasah / religious | Religious and school programmes can coexist with national/international programmes. Their goals and activities remain identifiable rather than being flattened into a generic subject score. | [Kemenag on KMA 1503/2025](https://kebumen.kemenag.go.id/kakankemenag-kebumen-kma-1503-perkuat-deep-learning-dan-nilai-cinta-di-madrasah/) |
| Montessori | Support school-defined stages, observational evidence and descriptors rather than assuming a universal examination syllabus. | [Association Montessori Internationale](https://montessori-ami.org/about-montessori) |
| AP | An AP subject is a course/assessment programme that may supplement another school curriculum. | [College Board courses](https://apcentral.collegeboard.org/courses) |

Additional configurable framework choices are IPC, IMYC, Singapore-based, US/state standards, Australian and school-developed/blended. Their school-specific stages, licensed content and grading policy are entered by the school. They do not come with an invented provider syllabus. The Australian curriculum portal and Singapore programme overview were inspected, but detailed syllabuses for those choices were not imported. IPC/IMYC detailed source retrieval was unavailable in this session; no provider content was inferred from that failure.

The phase starter for Merdeka includes Foundation and A–F. F allows the vocational grade-13 case; schools can narrow the range. Cambridge stages are not assigned Indonesian grade numbers automatically. The question bank now accepts school grade labels 0–20, including early years and vocational continuation.

## Implemented model and workflow

1. Academic: create a programme for an academic year with its framework, school name, version, teaching language and reference. Starter stages are created atomically and remain editable.
2. Attach school subjects to programme stages, retaining syllabus code, edition and level. Register the programme for an entire class or selected students. Multiple registrations can coexist.
3. Enter outcomes, their parent CP/objective, strand/theme, activity type and sequence. Configure numeric, rubric, letter or descriptor scales with school assessment criteria.
4. Map a course to one or more programme subjects. The database requires the programme year, school subject and enrolled class/stage to agree.
5. Learning/Exam: assigned teachers align course/lesson/assignment/question-set/exam resources with outcomes. Students receive only the programmes they follow and published-resource alignments.
6. Teachers record outcome evidence using that programme's scale. Draft feedback is private to teachers; published evidence is visible only to the corresponding enrolled student. Report pages/CSV preserve each scale rather than aggregating incompatible grades.
7. Each evidence record snapshots programme version, subject, outcome and scale. Used scale bounds/labels cannot be rewritten. Existing raw O-Exam scoring remains separately identifiable.
8. Existing AI reservations include up to 40 aligned objectives and programme/syllabus metadata. No student identity or assessment feedback is included. Teacher review remains required; this release does not claim to resolve the previously observed AI Gateway authentication error.

New records are additive. No old course, class, subject or student is silently assigned a curriculum. School staff choose their actual programme editions and content. This is a configurable management implementation, not an accreditation decision, an exam-board certification engine or a licensed syllabus redistribution service.

## Access enforcement

| Module | Allowed roles |
| --- | --- |
| Academic | STAFF, TEACHER |
| Learning | TEACHER, STUDENT |
| Exam | TEACHER, STUDENT |

The restrictions intersect with active accounts, active tenants, module switches and existing permissions. Teacher receives Academic **read** grants; existing Academic write grants are preserved. Student receives `exams.participate` for the existing assigned-class exam RPC; administrative REST lists are not opened to students. Checks exist in navigation/routes, the existing NestJS module guard through `app_module_enabled`, private RPC entry points, and restrictive RLS. Core calendar school-date projections remain shared infrastructure.

| O-Connect sender | Recipients |
| --- | --- |
| OWNER | All active permitted users across tenants |
| PRINCIPAL | STAFF, TEACHER in own tenant |
| STAFF | PRINCIPAL, TEACHER, PARENT in own tenant |
| TEACHER | All permitted users in own tenant |
| STUDENT | STUDENT, TEACHER in own tenant |
| PARENT | TEACHER, STAFF in own tenant |

This is a **per-sender** rule. Receiving an Owner message does not grant permission to reply across tenants. Such conversations show a read-only composer state. Cross-tenant Owner conversations are direct; group membership remains within one tenant to avoid exposing tenants' member lists to each other. A group member may send only when the matrix permits every current recipient. Existing disallowed messages are excluded from thread reads, inbox previews, RLS and attachment reads. Owner's permission to contact users does not allow reading unrelated conversations.

## Validation and deployment

- `role_connect_part4.sql`: all 72 directed same-/cross-tenant role pairs, contact visibility, direct creation and sends, legacy conversations, mixed-group bypass, module role matrix, active-account restrictions.
- `curriculum_part4.sql`: simultaneous Merdeka/Cambridge, whole-class and individual enrolment, programme/phase/subject integrity, teacher assignment, student privacy, draft visibility, scale range and historical snapshots.
- Existing integration, O-Connect, school, Owner and exam-load regression fixtures remain in the database gate with expectations updated for the new explicit role policy.
- Production verification uses temporary owned users and isolated test tenants; it checks the deployed frontend, API denial paths, programme workflows, messaging and cleanup.

Deployment order: pass PR CI, apply the three reviewed additive migrations, align filenames with Supabase migration history, merge, await Vercel production, run production verification, check public health and fixture cleanup. The deployed NestJS guard already calls the database module predicate; Part 4 does not change API application source or require a VPS runtime replacement.
