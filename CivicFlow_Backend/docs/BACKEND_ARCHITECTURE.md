# Backend architecture and response design

## Service boundary

This repository provides the CivicFlow HTTP API. The future frontend will be a separate client that calls `/api/v1`; it should not connect directly to PostgreSQL and must never receive the Gemini API key, database password, JWT signing secret, or private object-store credentials.

```text
Future web/mobile client
       | HTTPS + Bearer JWT
       v
FastAPI routers + request validation + role checks
       |                     |
       |                     +--> AI adapter: Gemini API / Ollama / rules fallback
       v
Domain workflow services
  - deterministic priority heuristic
  - duplicate candidate search (review suggestions only)
  - allowed status transitions
  - closure evidence gate
       |
       +--> SQLAlchemy transaction --> PostgreSQL
       |                                users / teams / incidents / evidence metadata / audit_logs
       |
       +--> private local evidence folder (development only)
```

## Design choices

1. **Separate analysis from persistence.** `POST /ai/analyze` can preview triage without creating a case. `POST /incidents` analyzes and persists one incident in the same request; its result returns the persisted incident, analysis, and duplicate candidates.
2. **Canonical response envelope.** Successful JSON responses have `data` and `meta.request_id`; paginated responses add `meta.pagination`. Errors have `error.code`, `error.message`, optional `error.details`, and `meta.request_id`. Download endpoints return the file bytes with private cache headers.
3. **Safe role defaults.** Signup always yields a citizen. An admin provisions officers through a protected endpoint. Citizens only read incidents they created; staff can operate the municipal queue; only admins manage teams or active staff accounts.
4. **Auditable actions.** Incident creation/edit, assignment, duplicate linking, status changes, closure verification, image upload, team changes and staff lifecycle actions produce audit entries within the relevant database transaction.
5. **Do not trust AI for irreversible work.** AI output is validated against the approved category/department/severity schema. Priority is calculated by a transparent heuristic, and incident closure requires after evidence plus staff verification. Duplicate matches are suggestions; staff must choose to link a duplicate to a canonical incident.
6. **Explicit fallback label.** If a configured AI provider is unavailable, the endpoint returns `provider=rules_fallback` and a warning rather than pretending the output came from Gemini/Gemma.

## Workflow state machine

```text
open <--> assigned --> in_progress --> resolved --> closed
                         ^                |
                         +----------------+

A duplicate is linked through /merge-duplicate, not a normal status update.
Only an admin can reopen a closed record.
Resolving requires an `after` image and human `closure_verified=true`.
```

## Frontend-facing conventions

- UUIDs are stable record identifiers; `incident_code` (for example `CF-261014-A1B2C3`) is the human-readable ticket reference.
- API timestamps are ISO-8601 values.
- Status strings are lower-case snake case: `open`, `assigned`, `in_progress`, `resolved`, `closed`, `duplicate`.
- Severity strings: `low`, `medium`, `high`, `critical`.
- The `provider` value must be shown honestly; `rules` and `rules_fallback` are not generative-model responses.
- Coordinates are nullable; render a marker only when real coordinates are supplied. Do not silently substitute sector centroids as precise report locations.
- The API's priority score is explainable triage, not an emergency response time or prediction.
