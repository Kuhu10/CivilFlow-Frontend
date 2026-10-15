# CivicFlow API — backend-first foundation

CivicFlow is a backend service for AI-assisted civic incident intake and municipal work-order operations. This repository intentionally contains **no frontend**. The next layer should be designed only after the API and database contract are agreed.

## Implemented capabilities

- FastAPI API with generated OpenAPI/Swagger docs and `/redoc`.
- PostgreSQL-first SQLAlchemy persistence and Alembic migrations.
- Citizen registration, JWT login, role-based access (`citizen`, `officer`, `admin`).
- Text classification via Gemini, local open-weight models through Ollama, or deterministic labelled fallback rules.
- Optional multimodal triage for JPEG/PNG/WebP images when the configured model supports vision.
- Incident intake, filtering/pagination, editing, assignments, guarded status transitions, duplicate candidate suggestions and explicit duplicate linking.
- Private image evidence uploads with type validation, size cap, checksum, and authenticated downloads.
- Human closure verification and auditable incident timelines.
- Team administration and database-backed aggregate analytics.
- Request IDs and consistent JSON response/error envelopes.

## Important prototype boundaries

- AI classifications and priority scores are decision support, not emergency triage or authoritative facts.
- Duplicate candidates are not merged automatically; a staff user must choose a canonical incident.
- No live Chandigarh municipal system, emergency service, citizen identity system, geocoder, route optimizer, or live traffic source is connected.
- Coordinates are optional and should be stored only if supplied/verified; this backend does not invent them.
- Image files currently use private local filesystem storage. For production, swap this for private object storage and signed downloads before using multiple API replicas.
- The initial administrator is created only when `BOOTSTRAP_ADMIN_EMAIL` and `BOOTSTRAP_ADMIN_PASSWORD` are explicitly configured before seeding.

## Quick start with Docker Compose

Requirements: Docker with Compose support.

```bash
cp .env.example .env
python -c "import secrets; print(secrets.token_urlsafe(48))"
# Put the generated value into SECRET_KEY in .env.
# Optional: set BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD in .env.
docker compose up --build
```

The stack starts PostgreSQL and the API, applies the initial migration, seeds the default teams, then serves:

- API base: `http://localhost:8000/api/v1`
- Swagger UI: `http://localhost:8000/docs`
- ReDoc: `http://localhost:8000/redoc`
- Liveness: `http://localhost:8000/health/live`
- Readiness: `http://localhost:8000/health/ready`

To stop while preserving local database/uploads: `docker compose down`. To erase the DB volume as well: `docker compose down -v` (destructive; do not run if you need the stored data).

## Run API directly (without Compose)

1. Create a virtual environment and install dependencies:

```bash
python -m venv .venv
source .venv/bin/activate          # Windows PowerShell: .venv\\Scripts\\Activate.ps1
python -m pip install -r requirements.txt
cp .env.example .env
```

2. Ensure PostgreSQL is running and `DATABASE_URL` points to it. Alternatively for a disposable local smoke test, set `DATABASE_URL=sqlite:///./civicflow.db`; PostgreSQL remains the target database for a shared/team environment.
3. Generate and set `SECRET_KEY`. Set an initial admin email/password if you need team administration.
4. Run migrations, seed teams/admin, start the API:

```bash
python -m alembic upgrade head
python -m app.seed
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

## Configure AI

### Deterministic rules only

```env
AI_PROVIDER=rules
```

This works without external AI credentials. API responses explicitly mark `provider=rules`.

### Google Gemini API

```env
AI_PROVIDER=gemini
GEMINI_API_KEY=your_private_key
GEMINI_MODEL=gemini-flash-latest
```

### Open-weight Gemma through Ollama

Install/run Ollama where the API process can reach it and pull a model. For image analysis, use a vision-capable model, for example `gemma3:4b`:

```bash
ollama pull gemma3:4b
```

Configure:

```env
AI_PROVIDER=ollama
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_MODEL=gemma3:4b
OLLAMA_TIMEOUT_SECONDS=90
```

Ollama image input uses its `/api/generate` endpoint's base64 image field and JSON-schema `format`. If the configured provider fails, a labelled rule-based fallback is returned; inspect `analysis.provider` and `analysis.warnings` before presenting the result as model-generated.

## First request walkthrough

1. Register a citizen using `POST /api/v1/auth/register`.
2. Login using `POST /api/v1/auth/login` and copy `data.access_token`.
3. In Swagger, click **Authorize** and enter the token as Bearer credentials.
4. Call `POST /api/v1/incidents` with description and sector.
5. Read the `data.incident.id`, upload evidence or query the incident, and inspect the audit timeline.

For team management and global analytics, provision an admin as described above. Register does not accept a role field and always creates citizens.

## API contract and schema docs

- `docs/API_CONTRACT.md` — routes, example request/response bodies, role model, workflow transitions and error envelope.
- `docs/DATABASE_SCHEMA.md` — table schema, relationships, constraints and evidence storage caveats.
- `docs/ENVIRONMENT.md` — complete environment variable list and database/AI setup.

## Tests

```bash
python -m pytest -q
```

The included tests cover password hashing and core classification/priority logic. Extend these with database integration tests and authorization/role-transition tests before production use.

## Security checklist before a real pilot

- Use a unique production `SECRET_KEY`, HTTPS, strict CORS, strong DB credentials, least privilege and database backups.
- Implement rate limiting on authentication/AI/upload routes.
- Add malware/content scanning and a privacy/retention policy for submitted images.
- Move images to private object storage with short-lived signed URLs; set limits and retention.
- Add staff provisioning/invitation flows and MFA for municipal operators.
- Add integration tests, load tests, monitoring, alerting and a tested migration/rollback plan.
- Confirm legal authority and consent before collecting personal data or linking reports to individuals.
