# CivicFlow API contract (v1)

Base URL in local development: `http://localhost:8000/api/v1`  
Interactive OpenAPI UI: `http://localhost:8000/docs`  
ReDoc: `http://localhost:8000/redoc`

All routes under `/api/v1` except registration and login require `Authorization: Bearer <access_token>`. The OpenAPI page can authorize requests using the Bearer scheme. Citizen accounts are created by public self-registration and can only view their own incidents. Officers and administrators can view the operational work queue. Only administrators can create/edit teams.

## Standard response envelope

Success:

```json
{
  "data": { "id": "..." },
  "meta": { "request_id": "..." }
}
```

Paginated collections add `meta.pagination`:

```json
{
  "data": [],
  "meta": {
    "request_id": "...",
    "pagination": { "page": 1, "page_size": 20, "total": 0, "pages": 0 }
  }
}
```

Error:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed.",
    "details": [{ "location": ["body", "description"], "message": "...", "type": "..." }]
  },
  "meta": { "request_id": "..." }
}
```

Responses include an `X-Request-ID` header for traceability. Passwords, access tokens, and raw uploaded image bytes are never included in JSON responses.

## Endpoint inventory

| Method | Path | Access | Purpose |
|---|---|---|---|
| GET | `/health/live` | Public | Process liveness |
| GET | `/health/ready` | Public | Database readiness check |
| POST | `/api/v1/auth/register` | Public | Create a citizen account |
| POST | `/api/v1/auth/login` | Public | Exchange email/password for a JWT |
| GET | `/api/v1/auth/me` | Authenticated | Return current user |
| GET | `/api/v1/auth/staff` | Officer/Admin | List active staff records for assignment workflows |
| POST | `/api/v1/auth/staff` | Admin | Provision an officer account (never an admin account) |
| PATCH | `/api/v1/auth/staff/{user_id}/active` | Admin | Activate/deactivate an officer/admin account |
| POST | `/api/v1/ai/analyze` | Authenticated | Analyze text report |
| POST | `/api/v1/ai/analyze-image` | Authenticated | Analyze description and image using configured AI provider |
| POST | `/api/v1/incidents` | Authenticated | Create a work order and return AI analysis + possible duplicate suggestions |
| GET | `/api/v1/incidents` | Authenticated | Search/filter/paginate incidents; citizens see only their own |
| GET | `/api/v1/incidents/{id}` | Authenticated | Fetch an incident |
| PATCH | `/api/v1/incidents/{id}` | Officer/Admin | Edit triage fields and notes |
| POST | `/api/v1/incidents/{id}/assign` | Officer/Admin | Assign a team and optional staff assignee |
| POST | `/api/v1/incidents/{id}/merge-duplicate` | Officer/Admin | Link a duplicate record to a canonical active incident |
| POST | `/api/v1/incidents/{id}/status` | Officer/Admin | Advance a valid workflow state |
| POST | `/api/v1/incidents/{id}/verify-closure` | Officer/Admin | Record human closure verification/rejection |
| POST | `/api/v1/incidents/{id}/evidence` | Incident creator or Staff | Upload validated before/after/other image evidence |
| GET | `/api/v1/incidents/{id}/evidence` | Incident creator or Staff | List evidence metadata and private download paths |
| GET | `/api/v1/incidents/{id}/evidence/{evidence_id}/download` | Incident creator or Staff | Download a private evidence image |
| GET | `/api/v1/incidents/{id}/timeline` | Incident creator or Staff | Read the latest audit events for the incident |
| GET | `/api/v1/teams` | Officer/Admin | List active teams, optionally by department |
| POST | `/api/v1/teams` | Admin | Create a team |
| PATCH | `/api/v1/teams/{id}` | Admin | Update team/capacity/active state |
| GET | `/api/v1/analytics/overview` | Officer/Admin | Aggregate database-backed operational counts |

## Example requests

### Register a citizen

`POST /api/v1/auth/register`

```json
{
  "full_name": "Demo Citizen",
  "email": "citizen@example.com",
  "password": "ReplaceWithALongPassword1!"
}
```

Role is forced to `citizen`. The public API does not allow self-registration as an officer or administrator.

### Login

`POST /api/v1/auth/login`

```json
{ "email": "citizen@example.com", "password": "ReplaceWithALongPassword1!" }
```

Returns `data.access_token`, `data.token_type`, `data.expires_in`, and `data.user`.

### Analyze a report

`POST /api/v1/ai/analyze`

```json
{
  "description": "A deep pothole near the Sector 17 crossing makes two-wheelers swerve into moving traffic.",
  "sector": "Sector 17"
}
```

Example `data`:

```json
{
  "suggested_title": "Pothole near Sector 17 crossing",
  "summary": "A reported road defect near a crossing may pose a traffic safety risk.",
  "category": "Road Damage",
  "department": "Roads & Infrastructure",
  "severity": "critical",
  "safety_risk": true,
  "recommended_action": "Inspect ...",
  "rationale": "...",
  "tags": ["road-damage", "safety-review"],
  "provider": "gemini",
  "warnings": []
}
```

The exact title, severity and explanation vary by input/provider. `provider` can be `gemini`, `ollama`, `rules`, or `rules_fallback`. The frontend must show fallbacks accurately and keep human review visible.

### Create an incident

`POST /api/v1/incidents`

```json
{
  "description": "A deep pothole near the Sector 17 crossing makes two-wheelers swerve into moving traffic.",
  "sector": "Sector 17",
  "location_description": "Near the pedestrian crossing",
  "affected_count": 25,
  "latitude": 30.7419,
  "longitude": 76.7823
}
```

`data` contains:
- `incident`: persisted work-order record with generated `id` and `incident_code`;
- `analysis`: triage result from the configured AI service;
- `possible_duplicates`: candidates to review, not automatic merges;
- `deduplication_note`: explains that no records were merged automatically.

For the sector map, coordinates supplied by a user should be preferred. If coordinates are unknown, leave them null rather than inventing a point.

### Search incidents

`GET /api/v1/incidents?status=open&severity=critical&sector=Sector%2017&page=1&page_size=20`

Supported query parameters: `status`, `severity`, `department`, `category`, `sector`, `q`, `assigned`, `page`, `page_size`.

### Assign work

`POST /api/v1/incidents/{incident_id}/assign`

```json
{
  "team_id": "TEAM_UUID_FROM_GET_TEAMS",
  "assigned_to_id": null,
  "note": "Prioritize after supervisor safety check."
}
```

A team's department must match the incident department or be `Other / Needs Review`.

### Upload evidence

`POST /api/v1/incidents/{incident_id}/evidence` as `multipart/form-data`:
- `kind`: `before`, `after`, or `other`;
- `note`: optional explanation;
- `file`: a valid JPEG, PNG, or WebP image up to `MAX_UPLOAD_MB`.

The server validates the actual image format and stores metadata, byte size and SHA-256 checksum. Raw file paths are not publicly mounted.

### Verify and resolve

1. Upload the `after` image to `/evidence`.
2. `POST /api/v1/incidents/{id}/verify-closure` with `{"verified": true, "notes": "Visual evidence reviewed by field supervisor."}`.
3. `POST /api/v1/incidents/{id}/status` with `{"status": "resolved", "note": "Repair completed and checked."}`.
4. Optionally move from `resolved` to `closed` with the status endpoint.

The AI provider does not automatically close incidents. Closure verification is a staff action. If verification fails, use `verified: false` and retain a note.

## Workflow rules

- Allowed main transitions: `open -> assigned|in_progress`, `assigned -> open|in_progress`, `in_progress -> assigned|resolved`, `resolved -> closed|in_progress`, `closed -> in_progress` (admin only).
- Marking `resolved` requires `closure_verified=true` and at least one `after` image.
- A closed incident can only be reopened by an admin.
- Duplicate linking uses `/merge-duplicate`; the duplicate record is preserved with its audit trail and `merged_into_id` pointing at the canonical incident.
- Priority is a deterministic, inspectable heuristic, not an ML prediction or emergency-response SLA.

## HTTP status codes

`200` success; `201` created; `401` missing/invalid credentials; `403` role not allowed; `404` not found (including incidents the citizen does not own); `409` workflow/conflict; `413` upload too large; `415` invalid image type/content; `422` validation/department mismatch; `500` generic server failure; `503` database readiness failure.
