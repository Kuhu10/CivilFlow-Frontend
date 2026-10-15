# CivicFlow database design

## Choice

Use **PostgreSQL** as the canonical database. It provides relational integrity, indexed filtering, transactions and JSON fields for audit snapshots. Supabase can host PostgreSQL if a managed deployment is preferred; the backend connects through its PostgreSQL connection string. A local PostgreSQL service is included in `docker-compose.yml`.

The SQLAlchemy models are the source of truth. Apply schema changes with Alembic; do not manually edit live tables without a migration.

## Tables

### `users`

| Column | Type / constraint | Purpose |
|---|---|---|
| `id` | UUID primary key | Identity |
| `full_name` | varchar(120), required | Display name |
| `email` | varchar(320), unique/indexed | Login identity, stored lower-case |
| `password_hash` | varchar(255), required | Scrypt password hash; never plaintext |
| `role` | varchar(20), indexed | `citizen`, `officer`, `admin` |
| `department` | nullable varchar(100) | Staff department, if applicable |
| `is_active` | boolean | Account disable flag |
| `created_at` | timestamptz | Account creation time |

Public registration always creates the `citizen` role. Staff accounts must be provisioned by an administrator/controlled seed process.

### `teams`

`id` UUID PK; `name` unique; `department`; optional `base_sector`; optional `supervisor_id` FK to users; `capacity`; `is_active`; `created_at`.

### `incidents`

| Column group | Purpose |
|---|---|
| Identity | `id` UUID PK; unique `incident_code` |
| Citizen report | `title`, `description`, `summary`, `sector`, optional `location_description`, optional `latitude`/`longitude` |
| AI/triage | `category`, `department`, `severity`, `safety_risk`, `recommended_action`, `ai_rationale`, `ai_provider`, `tags` JSON |
| Operations | `status`, `priority_score`, `affected_count`, `source`, `assigned_team_id`, `assigned_to_id` |
| Closure | `closure_verified`, `resolution_notes`, `resolved_at` |
| Duplicate linking | `merged_into_id` self-FK; source record remains preserved as status `duplicate` |
| Audit/ownership | `created_by_id` FK to users; `created_at`, `updated_at` |

Indexes support incident code lookup, common sector/status queue filtering, creation-time/category filtering, severity, status, department, category and assigned-team filtering.

### `evidence`

`id` UUID PK; `incident_id` FK; `uploaded_by_id` FK; `kind` (`before`, `after`, `other`); sanitized original filename; private `storage_key`; validated MIME type; byte size; SHA-256 checksum; optional note; creation time.

The initial implementation uses a private local filesystem volume. This is suitable for local demo operation, not a horizontally scaled production deployment. Before production, replace `LocalEvidenceStore`/file writes with private object storage (for example Supabase Storage, Amazon S3, or Google Cloud Storage), use short-lived signed downloads, and configure retention/deletion rules. Never serve the uploads directory as a public static folder.

### `audit_logs`

`id` UUID PK; nullable actor FK; nullable incident FK; action; old/new JSON snapshots; request ID; timestamp. The API writes log entries for registration, create/edit, assignment, status, closure verification, evidence upload, team changes and duplicate linking. The initial project does not expose direct log mutation/deletion routes.

## Relationships

- A `User` can create many `Incident` records.
- A `Team` can be assigned to many incidents; each incident has at most one assigned team and one optional individual assignee.
- An `Incident` can have many `Evidence` files.
- `Incident.merged_into_id` points from a duplicate record to its canonical incident.
- `AuditLog` references its actor and, where applicable, the incident being acted upon.

## Data handling rules

- Do not use sector-centre approximations as if they were precise citizen locations. Persist coordinates only when explicitly supplied or obtained from a future verified geocoding flow.
- Duplicate matching only provides a candidate list. It never deletes records or automatically merges complaints.
- Do not infer actual affected-person counts from model output; `affected_count` is user/staff supplied and can default to one.
- Keep evidence private, authenticate downloads, and validate the binary image format rather than trusting a filename or `Content-Type` header.
- Use production migrations/backups, TLS database connections, least-privilege database credentials and a tested retention policy before civic pilot use.
