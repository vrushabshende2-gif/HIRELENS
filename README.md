# HireLens

Adaptive technical interviews with a live Gemini interviewer, a focused candidate experience, and evidence-based recruiter scorecards. React + TypeScript, Django + Django REST Framework, PostgreSQL, and the Gemini API. Everything can run locally without hosting fees; the deployment blueprint uses free service plans.

## Run locally

Requirements: Python 3.12+, Node.js 22+, npm. Commands below use PowerShell from the project directory.

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy RemoteSigned
& .\scripts\bootstrap.ps1
.venv\Scripts\python.exe scripts\run.py
```

`bootstrap.ps1` is safe to rerun. It detects an existing `.venv` instead of trying to recreate a virtual environment whose Python executable may already be active; this avoids the Windows `Permission denied` message from running `python -m venv .venv` inside an activated environment.

Open **http://localhost:8000**. On macOS/Linux replace `.venv\Scripts\python.exe` with `.venv/bin/python` and `npm.cmd` with `npm`.

Setup creates a random application secret, applies migrations, collects the built frontend, and seeds fictional demo data plus the governed question catalog. It never overwrites an existing `.env`. `scripts/run.py` supervises both the web process and the durable evaluation/email worker; running only the web process cannot process interviews.

**Demo access:** open `.runtime/demo-access.json` locally for the randomly generated recruiter password, candidate password, and candidate invitation URL. This file is ignored by Git. The seed includes 18 original questions, two positions, two drives, six clearly labeled illustrative scorecards, and a fresh candidate invitation. Seeding is idempotent and permitted only with `DEBUG=true`.

The seeded recruiter dashboard, report comparison, analytics, PDF/CSV exports, configuration screens, signup verification, password reset, candidate profile/settings, privacy requests, and MFA enrollment work without any third-party key. **New live interviews and answer evaluation require Gemini**; missing credentials produce a designed unavailable state and do not consume the invitation. Seeded scores are illustrative and are never used as a fallback for real submissions.

The catalog command creates exactly **4,320 governed questions** (36 technology tracks × 12 competencies × 5 levels × 2 styles). Each row carries a stable catalog key, rubric concepts, misconceptions, role tags, expected duration, calibration metadata, and a quality status. Run it independently with `.venv\Scripts\python.exe manage.py seed_question_catalog`; it is idempotent and performs duplicate, rubric, and schema checks before activation. Hosted recruiters can open Question Bank and choose **Initialize catalog**; the same catalog is created in bounded batches without requiring a server shell.

Recruiter question-bank reads are paginated (100 rows by default, 200 maximum), so the catalog does not become a single oversized API response. The worker also prunes expired rate-limit buckets and processes interview timeouts in bounded batches.

## Enable Gemini

1. Create a key for a **Free-tier, billing-disabled project** in [Google AI Studio](https://aistudio.google.com/apikey).
2. Put it in the root `.env` as `GEMINI_API_KEY=...`. Never place it in a `VITE_` variable or commit it.
3. The defaults are `GEMINI_MODEL=gemini-3.5-flash-lite` and `GEMINI_EMBEDDING_MODEL=gemini-embedding-2-preview`. They are independently configurable server-side. Embedding 2 uses the documented sentence-similarity prompt; the adapter also supports Embedding 001's task-type parameter.
4. Check the project's actual model quotas in AI Studio. Set the local `AI_REQUESTS_PER_MINUTE` and `AI_REQUESTS_PER_DAY` caps at or below them. Defaults are 8 and 100 total HTTP calls across models; these are application caps, not Google's promised allowances.
5. The default live model is `gemini-3.8-live`. Override `GEMINI_LIVE_MODEL` only when Google documents a compatible replacement. `AI_LIVE_SESSIONS_PER_MINUTE=3` and `AI_LIVE_SESSIONS_PER_DAY=30` bound demo use.
6. Run `.venv\Scripts\python.exe manage.py check_gemini`. This explicitly sends a fictional technical answer and verifies embeddings, structured grading, and exact evidence quotes. Then restart `scripts/run.py` to load configuration changes.

Typical uncached short answers use two embedding requests and one grading request, followed by one report request per interview. Cached expected answers reduce that count; long answers and retries increase it. Quota exhaustion queues work without assigning substitute scores. Provider time never reduces the candidate's answering budget.

Gemini is the chosen LLM provider; no local generative model or paid model API is required. The [current pricing page](https://ai.google.dev/gemini-api/docs/pricing) lists free standard inference for the selected model families. Model access and quotas still depend on the account.

## Email, verification, and password reset

Local development writes transactional emails to the ignored `.mail/` directory. Start the worker, sign up, and open the verification URL from that local file. Reset links work the same way. Demo accounts are already verified.

Deployment uses Resend's HTTPS transactional endpoint. The private demo blueprint uses `EMAIL_FROM=HireLens <onboarding@resend.dev>`, which can deliver only to the Resend account owner. For real recipients, set `EMAIL_FROM=HireLens <your-verified-domain@example.com>` and verify that domain in Resend. Failed sends stay visible in the job records with safe error codes and are retried. Production startup refuses to silently use a dummy email backend.

## What is implemented

- Argon2id password hashing, signup, verification, reset, expiring database sessions, logout revocation, CSRF protection, brute-force throttling, and recruiter/candidate authorization.
- Candidate workspace profile, links, accommodations, notification preferences, transcript retention, export/deletion requests, password/session management, and authenticator-app MFA with recovery codes. Recruiter workspaces support owner/admin/recruiter/reviewer/auditor memberships and audited changes.
- Position skills and minimums; weighted text/code question rubrics; question editing and archiving; draft, publish, and close drive flows; immutable published question pools; expiring email-bound invitation links with time accommodations.
- Candidate consent and instructions; a real-time Gemini voice interviewer with a local camera preview, on-screen questions, live captions, one constrained clarification turn, and a typed accessibility recovery path; no recording or media upload; medium-first adaptive question selection; weighted topic coverage; autosave and local recovery; server-side timers; resumable interviews; tab ownership; idempotent submissions; highlighted JavaScript, TypeScript, and Python editing.
- Genuine embedding similarity, Gemini concept assessment with verified verbatim evidence, deterministic score composition, static syntax/structure checks, durable retryable jobs, and grounded report insights.
- Detailed scorecards, transcript and rubric inspection, topic scores, confidence indicators, comparison within a drive, recruiter review decisions, drive analytics, and PDF/CSV downloads.
- Responsive editorial indigo/ink UI, bundled local fonts, keyboard-accessible dialogs/forms, loading, empty, unavailable, and error states.

## Deployment at $0

The included `Dockerfile` builds the frontend and serves it with Django/WhiteNoise/Waitress. The worker shares the same small instance; PostgreSQL stores jobs so process restarts do not lose submissions.

1. Create a **Neon Free** PostgreSQL project. Copy its connection URI into the hosting environment as `DATABASE_URL`; keep `sslmode=require`.
2. Push the repository, excluding `.env`, `.runtime`, `.mail`, databases, and artifacts, to your own Git repository.
3. In Render, create a Blueprint from `render.yaml`. It requests a **Free web service**, generates a secret, and asks for Neon, Gemini, and Resend credentials. No paid worker or Render database is provisioned.
4. Render's provided hostname configures the origin and allowed host automatically. For a custom domain set `PUBLIC_URL=https://your-host` and `ALLOWED_HOSTS=your-host`. Keep `DEBUG=false` and secure cookies enabled.
5. The container validates settings, runs migrations, collects assets, then starts both processes. Sign up and verify a recruiter account. Create your roles/questions/drives, or seed a separate local demo database; public deployments never expose seeded passwords automatically.

Production requires PostgreSQL and HTTPS; it rejects local SQLite to prevent data loss on an ephemeral host. A free Render instance sleeps after inactivity, so cold starts and delayed background work are expected. Active interview polling keeps the instance active naturally. No artificial keep-alive service is used. See [costs and limits](docs/COSTS.md).

**Verification boundary:** the app has been run locally. Public deployment, live Google inference, Resend delivery, and a hosted PostgreSQL connection require your account credentials. A Docker runtime was not available in this workspace, so the Docker image has not been executed here. Deployment files are supplied, not claimed as a completed public deployment.

## Development and verification

After a frontend rebuild, run `manage.py collectstatic --noinput` and restart the web process so WhiteNoise reloads the asset manifest. For frontend hot reload use `npm run dev --prefix frontend`; Vite proxies `/api` to port 8000. Keep the backend and worker running. Set `PUBLIC_URL=http://localhost:5173` for that mode and restart the backend so CSRF trusts the dev origin.

```powershell
.venv\Scripts\python.exe manage.py test backend.core --noinput
npm.cmd run build --prefix frontend
.venv\Scripts\python.exe scripts/verify_browser.py
npm.cmd run test:a11y --prefix frontend
```

The full browser test creates a **separate database**, fictional accounts, and an app server on port 8001. It completes the recruiter forms and a 12-question candidate interview, verifies the stored report, downloads a PDF, and checks mobile layouts and browser errors. Standard Gemini requests are mocked and the Live endpoint intentionally activates the typed accessibility recovery path, so no browser verification sends media to Google. This validates application integration, **not model quality or live API compatibility**. Screenshots and test data go into ignored `artifacts/browser-*/` directories. The accessibility audit runs against the normal seeded app on port 8000.

Tests use Brave when installed at the standard Windows location. Otherwise install Chromium with `npx playwright install chromium` from `frontend`, or set `BROWSER_EXECUTABLE`. On Linux CI use `npx playwright install --with-deps chromium`.

Optional formatting tools: `pip install -r requirements-dev.txt`, `ruff format backend evaluation scripts`, `ruff check backend evaluation scripts`, and `npm run format --prefix frontend`. Runtime dependencies and frontend dependencies are locked.

## Structure

```text
backend/config/             Django settings, routes, WSGI
backend/core/               Models, auth, APIs, jobs, reports, seeds, tests
backend/core/migrations/    Versioned schema
evaluation/                Gemini adapter, scoring, adaptive selection
frontend/src/              Typed React pages, UI components, design system
frontend/tests/            Browser and accessibility verification
scripts/                   Local setup, supervision, deployment, isolated test server
docs/                      Architecture, scoring, costs, operational boundaries
```

Read [architecture and scoring](docs/ARCHITECTURE.md) and [security and operational notes](docs/OPERATIONS.md) before using the system beyond a fictional demonstration.
