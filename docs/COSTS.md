# Cost proof and practical limits

Checked against official sources on September 17, 2026. Free plans are external policies and can change; the application never upgrades a plan or activates billing.

| Component | $0 basis | Practical limits |
| --- | --- | --- |
| React, TypeScript, Vite, React Router, Recharts, Lucide, CodeMirror, Radix UI | MIT-licensed open-source packages | Runs on your existing computer; no license fee or hosted API. |
| Django, Django REST Framework, WhiteNoise, Waitress, ReportLab | BSD-family/MIT open-source packages | CPU/memory and your hardware or host limits. No paid auth or PDF service. |
| Argon2, Pydantic, HTTPX, tree-sitter, Python parsing | Permissively licensed open-source libraries | Hashing consumes memory; static parsing does not execute code. |
| Instrument Sans and Instrument Serif | SIL Open Font License; bundled locally | No Google Fonts network dependency or font-service fee. |
| SQLite development database | Public domain | Local single-machine development. Not used on ephemeral hosting. |
| PostgreSQL | PostgreSQL License | Self-hosting uses existing hardware; managed deployment uses Neon Free. |
| Gemini Flash-Lite generation | Standard Free-tier inference | Project/model-specific RPM, TPM, and RPD limits. No guaranteed universal quota. No billing-enabled project or paid automatic fallback. [Pricing](https://ai.google.dev/gemini-api/docs/pricing), [limits](https://ai.google.dev/gemini-api/docs/rate-limits). |
| Gemini Embedding 2 | Standard text embedding Free tier | 768-dimensional cached vectors, bounded text chunks. Embeddings use ordinary synchronous inference, not the paid asynchronous Batch API. Same project quota constraints. [Pricing](https://ai.google.dev/gemini-api/docs/pricing). |
| Gemini 3.8 Live | Standard Free-tier real-time audio inference | One short-lived constrained session per spoken question. Google currently lists free-tier audio input and output as free of charge, but enforces account/model quotas and permits free-tier data use for product improvement. HireLens enforces 3 session starts/minute and 30/day by default. [Pricing](https://ai.google.dev/gemini-api/docs/pricing), [ephemeral-token guide](https://ai.google.dev/gemini-api/docs/live-api/ephemeral-tokens). |
| Render Free web hosting | Free compute plan | 750 instance-hours/workspace/month; sleeps after 15 idle minutes, roughly one-minute cold start; ephemeral filesystem. Shared outbound/build limits can suspend service. Outbound SMTP is blocked, so email uses HTTPS. Keep the workspace on free plans without chargeable overage settings. [Free service limits](https://render.com/docs/free). |
| Neon Free PostgreSQL | $0 Free plan | Per project: 100 CU-hours/month, 0.5 GB storage, 5 GB public transfer; scales to zero after 5 idle minutes. Storage is the practical ceiling, not a fixed row count. Database polling keeps compute awake while the web instance is active. [Official quota source](https://github.com/neondatabase/website/blob/main/content/faqs/free-plan-limits-and-quotas.md). |
| Resend transactional email | Free plan | 100 sends/day and 3,000/month; normal recipient delivery needs a verified domain. The `onboarding@resend.dev` sender can be used only to test delivery to the account owner's email. Local file-based mail needs no account. [Free limits](https://resend.com/pricing). |
| Tests and tooling | Playwright/axe Apache/MIT-family; Ruff/Prettier MIT | Local CPU/disk. No hosted CI is required. Docker Engine is open source; local Docker Desktop eligibility is separate, and Docker Desktop is not required to run the app. |

Existing hardware, electricity, and internet are assumed. There is no newly rented GPU, paid vector database, paid sandbox, purchased domain, or paid PDF endpoint.

## What can stop a free demo

- **Gemini quota:** every spoken question also starts a Gemini Live session; two uncached embeddings plus one grading call follow each submitted answer, then one narrative call follows an interview. The defaults cap standard requests at 100/day and Live sessions at 30/day, supporting a few short demos rather than a hiring drive. Requests queue on throttling; they do not switch to a paid model or fabricate evaluations.
- **Database compute:** the worker polls for durable jobs while the service is running. At Neon's smallest compute, sustained all-month activity can exhaust its free compute allowance. Render sleep helps at demo scale; it also delays queued work. This architecture targets occasional demonstrations, not an always-on free production SLA.
- **Email limits:** verification and resets consume email sends. Throttling reduces abuse, but a free quota can still be exhausted.
- **Storage:** transcripts, embeddings, and security events accumulate. Purge according to a chosen retention policy and back up before cleaning candidate records. No automatic deletion of candidate evidence is configured.
- **Provider changes:** recheck free model availability and hosted-service quotas before a public demo. Application caps are safeguards; they cannot prove a supplied key belongs to a billing-disabled project.

## Data-use constraint

Google's unpaid-service terms restrict personal, sensitive, or confidential inputs, subject to regional distinctions. The default `AI_DATA_POLICY=demo_only` requires a demonstration drive and explicit candidate acknowledgement. Names/emails are kept out of evaluation payloads, but answer text itself could contain identifying data; the acknowledgement is not an anonymizer. Use fictional, non-sensitive content with the free API. [Gemini terms](https://ai.google.dev/gemini-api/terms).

The original ambition of screening real candidates with confidential evidence cannot be promised under every unpaid API's terms. A deployment for real hiring needs an independently reviewed data-processing arrangement or a locally hosted model on existing hardware. The requested Gemini implementation does not secretly substitute a local model or activate paid processing.
