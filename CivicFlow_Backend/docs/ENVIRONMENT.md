# Environment variables and external APIs

Copy `.env.example` to `.env` and supply values there. **Never commit `.env`, API keys, database passwords or real citizen data.** `.env.example` contains names/placeholders only.

## Environment variables

| Name | Required? | Purpose / guidance |
|---|---|---|
| `APP_NAME` | No | API title shown in OpenAPI docs |
| `APP_ENV` | No | `development` or `production`; production enforces a non-placeholder strong signing secret |
| `API_V1_PREFIX` | No | API prefix; normally `/api/v1` |
| `LOG_LEVEL` | No | Python logging level, normally `INFO` |
| `DATABASE_URL` | Yes for persistence | SQLAlchemy URL. Local Compose: `postgresql+psycopg://civicflow:civicflow@db:5432/civicflow`; direct local app: host `localhost`; Supabase: copy its connection string and use the `postgresql+psycopg://` driver prefix |
| `SECRET_KEY` | Yes for non-demo deployment | Random secret for signing JWTs. Generate with `python -c "import secrets; print(secrets.token_urlsafe(48))"`; keep private and stable across API replicas |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | No | JWT lifetime; default 60 minutes |
| `CORS_ORIGINS` | Before browser integration | Comma-separated exact allowed origins, e.g. `http://localhost:5173`. Add the deployed UI origin later; do not use `*` in production |
| `AI_PROVIDER` | No | `auto`, `gemini`, `ollama`, or `rules`. `auto` uses Gemini if an API key is available; otherwise a labelled deterministic rules fallback |
| `GEMINI_API_KEY` | Only for Gemini API | Secret from Google AI Studio/Google AI API configuration. Do not put it in browser/frontend code |
| `GEMINI_MODEL` | No | Google GenAI model name available to the API account; default `gemini-flash-latest` |
| `OLLAMA_BASE_URL` | Only for Ollama | URL reachable **from the backend process**, default `http://127.0.0.1:11434` |
| `OLLAMA_MODEL` | Only for Ollama | Pulled local Ollama model name; default `gemma3:4b` (a vision-capable Gemma 3 variant is needed for image analysis) |
| `OLLAMA_TIMEOUT_SECONDS` | No | Model response timeout, default 90 seconds |
| `UPLOAD_DIR` | Required for evidence storage | Private filesystem directory for local development; use a persistent volume |
| `MAX_UPLOAD_MB` | No | Max accepted image size, default 10 MB (supported formats: JPEG, PNG, WebP) |
| `BOOTSTRAP_ADMIN_EMAIL` | Optional | Admin email created by `python -m app.seed`; set with the password below |
| `BOOTSTRAP_ADMIN_PASSWORD` | Optional | Admin password; keep out of Git and shell history where possible. If one of the admin variables is set, both must be set |

## Database options

### Option A — Local Docker PostgreSQL (recommended for this project)

```bash
cp .env.example .env
# Edit .env: set SECRET_KEY to a generated random value.
# Optional: set BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD.
docker compose up --build
```

Compose starts PostgreSQL, applies Alembic schema migration, seeds teams/admin if requested, then serves the API on port `8000`. Open `http://localhost:8000/docs`.

### Option B — Supabase hosted PostgreSQL

1. Create a Supabase project and open **Connect** in its dashboard.
2. Copy a connection string suitable for a persistent backend or use the session pooler if the runtime needs IPv4.
3. URL-encode reserved characters in the password.
4. Set `DATABASE_URL` to the copied connection string with SQLAlchemy's psycopg driver prefix, e.g. `postgresql+psycopg://...`.
5. Run `python -m alembic upgrade head` once against the chosen database, then seed the teams/admin.

The backend uses ordinary PostgreSQL connectivity; a Supabase service-role key is **not** required for database access. Do not expose a database password or service-role key to browser code. Copy the exact host/user/port shown by Supabase rather than constructing one from the project name.

## Google AI API

The backend uses Google's maintained `google-genai` Python SDK and requests structured JSON using a Pydantic schema. Set `AI_PROVIDER=gemini` and `GEMINI_API_KEY`. If requests fail, the API keeps the workflow available but returns `provider=rules_fallback` plus a warning; clients must display this distinction.

## Open-weight local AI through Ollama

1. Install/start Ollama in the environment that can be reached by the backend.
2. Pull the desired model, e.g. `ollama pull gemma3:4b`.
3. Set `AI_PROVIDER=ollama`, `OLLAMA_BASE_URL`, and `OLLAMA_MODEL`.

The backend calls Ollama's local `POST /api/generate` endpoint with a JSON schema. For image input, the selected model must support images. If the backend runs inside Docker while Ollama runs on the host, `127.0.0.1` points at the container, not the host; change the base URL to a reachable host address and do not expose the Ollama port publicly without network controls.

## APIs not used by this backend version

- **Google Maps Directions/Routes API:** not configured or called. Leaflet/OpenStreetMap-based map rendering belongs to a future frontend decision; no Google Maps key is needed for these backend routes.
- **Municipal/citizen-service APIs:** no live Chandigarh government integration is connected.
- **Supabase Storage/S3/GCS:** evidence is currently stored on the local private filesystem; cloud object storage integration is not implemented yet.

## Official documentation references

- Google Gen AI SDK / structured JSON response schemas: https://googleapis.github.io/python-genai/ and https://ai.google.dev/gemini-api/docs/structured-output
- Ollama `/api/generate`, including JSON-schema output and base64 image inputs: https://github.com/ollama/ollama/blob/main/docs/api.md
- Supabase PostgreSQL connection modes and connection-string guidance: https://supabase.com/docs/guides/database/connecting-to-postgres
