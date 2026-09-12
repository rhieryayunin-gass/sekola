# OSEKOLA Enhancement Part 2

Source: the four-page **Osekola Enhancement Part 2 (1).pdf** supplied on 12 September 2026. This document tracks implementation and verification; unchecked items are not claims of completion.

## Acceptance criteria

- [ ] Tenant → academic year → semester → classroom → subject → course → lesson → assignment → submission navigation, with named choices instead of UUID entry.
- [ ] Parent/student relationships, alumni graduation, school assets/capacity, canteen directory and timetable notifications.
- [ ] Library (PDF, image, document and YouTube), teacher-reviewed question generation, editable question banks and printable PDF output.
- [ ] Attendance sessions and teacher overrides; QR flow and authenticated device integration contract for RFID/face readers.
- [ ] Student exam taking, bounded autosave, recovery, submit/grading and isolated concurrency verification. Admissions is a future section, as stated in the brief.
- [ ] Searchable/filterable finance reports and PDF printing; project templates, committee roles and Kanban work.
- [ ] Role-specific dashboards, tenant plan and eight module settings.
- [ ] Two-row navigation, unread badges, notification detail dialog and calendar views.
- [ ] Landing assessment/pricing/partner journeys and a distinct O-Connect illustration.
- [ ] Scenario-based maturity assessment, weighted score and package recommendation; referral-linked lead pipeline and recorded partner commissions.
- [ ] Two persistent demo schools, each with 1 principal, 3 staff, 5 teachers, 50 students and 50 linked parents (218 accounts total).
- [ ] Database isolation checks, application tests, CI, production deployment and production smoke verification.

## Commercial and external configuration

The recovered business context specifies Essential Rp9,999, Elevate Rp14,999 and Enterprise Rp29,999 per student/month, billed annually. Assessment levels are Manual (0–20), Digitized (21–40), Connected (41–60), Smart (61–80) and Intelligent (81–100); recommendation boundaries are 40 and 75. Exact earlier question wording and feature allocation were not available, so the implementation supplies an editable baseline rather than claiming to reproduce that conversation verbatim.

Google Form content/URL and partner offer copy are explicitly deferred in the brief. No unapproved discount value or automatic commission payout is introduced. RFID/face hardware requires a configured reader and physical verification; software simulation does not establish that a device works. Concurrency tests run against isolated fixtures, never against the shared production VPS.

Historical Phase 43–50 and Phase 51–54 live workflow verification, and the wider Phase 55 verification, retain their previous incomplete status until their own evidence is collected. Migration inspect/apply success does not complete those workflows.

Recovered assessment weights are 6,5,4,7,4,5,6,5,5,5,7,6,5,4,4,4,7,4,4,2. They sum to 99, despite the earlier description saying 100; the implementation preserves these relative weights and normalizes the final score to 100. Question wording remains an editable baseline, as the exact previous wording was not retrievable.
