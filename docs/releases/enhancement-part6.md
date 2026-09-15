# OSEKOLA Enhancement Part 6

Implements the supplied Part 6 PDF for the public website and shared module/role icons.

- Separate floating ecosystem, plans, and partner navigation on public pages; remove the login back-home link.
- Install the approved human hero animation, with MP4/WebM sources, poster, pause/play controls, and reduced-motion support.
- Move the previous hero illustration to School Digital Maturity and link the school-discussion CTA to the configured WhatsApp number.
- Center the curriculum section and show only Kurikulum Merdeka, Cambridge, Pearson Edexcel, and IB with cleaned supplied logos.
- Introduce eight photorealistic module stories using the expanding-card interaction in the supplied Zoom reference; preserve module detail dialogs.
- Add eight Indonesian/English FAQ disclosures between pricing and the teacher/student/parent section.
- Redesign all module and role icons without the green dot, put module names alongside icons, and replace the O-Connect dialog illustration.

## Verification

- Frontend unit suite: 28 files, 82 tests passed.
- Frontend lint, TypeScript, and production build passed locally.
- `verify-part6-public.mjs` checks the production build at desktop and mobile widths, English/Indonesian, both themes, video playback, all eight module dialogs, curriculum images, FAQ behavior, public navigation, and assessment/login rendering. GitHub Actions retains screenshot evidence.

This release does not require a database migration or a NestJS service update. Existing authentication, tenant access, and payment processing remain on their current production implementations.
