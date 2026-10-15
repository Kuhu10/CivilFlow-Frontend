# CivicFlow Frontend

Responsive React + TypeScript frontend for the CivicFlow FastAPI backend. This project uses the supplied generated video clips and is designed for phone, tablet, and desktop layouts.

## Features

- Cinematic public landing page with the supplied city-sunrise, neighborhood, and abstract-network clips.
- Login and citizen registration connected to `POST /auth/login` and `POST /auth/register`.
- Token-aware requests to `/auth/me`; access token is kept in `sessionStorage` for the current browser tab session, never embedded in the code or videos.
- Responsive signed-in workspace, mobile bottom navigation, report dashboard and counts based on the signed-in user's API results.
- Civic incident form, optional AI triage preview, category/department mapping, optional photo upload and user-selected map point.
- My Reports search/status filters and incident detail pages.
- Leaflet/OpenStreetMap with saved report coordinates only; the frontend does not invent incident coordinates. Coordinates outside the Chandigarh map area are not shown on its city view.
- Evidence listing/download/upload, incident activity timeline, clear loading/empty/error states.
- Reduced-motion support, mobile breakpoints and reduced-size, muted website video backgrounds.

## Requirements

- Node.js 20+ (Node 22 recommended)
- npm
- CivicFlow FastAPI backend running at `http://127.0.0.1:8000`

## Run locally on Windows

Open a new PowerShell terminal in this folder and run:

```powershell
Copy-Item .env.example .env
npm install
npm run dev
```

Open the URL printed by Vite, normally `http://localhost:5173`. Use `localhost` rather than `127.0.0.1` for the frontend because the backend's default CORS allowlist includes `http://localhost:5173`.

The API base URL is configured in `.env`:

```env
VITE_API_BASE_URL=http://127.0.0.1:8000/api/v1
```

This `VITE_` variable is public configuration, not a secret. Never put a database URL, Gemini API key, or JWT secret in a frontend environment variable. Those belong only in the backend environment.

## If the backend is running in GitHub Codespaces

The browser cannot use a Codespaces container's `127.0.0.1` as the backend host. Forward port `8000`, copy its browser-accessible forwarded URL, and set `VITE_API_BASE_URL` to that origin plus `/api/v1`, for example:

```env
VITE_API_BASE_URL=https://YOUR-CODESPACE-8000.app.github.dev/api/v1
```

Use the actual forwarded URL shown in the Ports tab. Then add the frontend's browser origin to the backend's `CORS_ORIGINS` setting and restart the backend. Do not copy the example domain literally.

## Build check

```powershell
npm run build
```

Production-ready static output is written to `dist/`. The API is still required at runtime. The app deliberately does not seed demo incidents into the browser; cards, report counts and detail pages use the signed-in user's real API response.

## Backend contract used

- `POST /api/v1/auth/register`
- `POST /api/v1/auth/login`
- `GET /api/v1/auth/me`
- `POST /api/v1/ai/analyze`
- `POST /api/v1/incidents`
- `GET /api/v1/incidents`
- `GET /api/v1/incidents/{incident_id}`
- `POST /api/v1/incidents/{incident_id}/evidence`
- `GET /api/v1/incidents/{incident_id}/evidence`
- `GET /api/v1/incidents/{incident_id}/evidence/{evidence_id}/download`
- `GET /api/v1/incidents/{incident_id}/timeline`

## Notes / prototype boundaries

- Citizen UI only. Staff dispatch/admin workspaces are not exposed in this client.
- AI results are suggestions; the UI labels `rules` and `rules_fallback` honestly and requires the user to review them.
- A new incident is created only after the user submits the form. AI preview does not automatically create a record.
- The backend may return possible duplicates after the incident is created; the UI displays that notice but does not merge records.
- The map uses OpenStreetMap tiles and user-supplied coordinates only. It is not a route optimizer and does not show live traffic or emergency dispatch.
- The frontend uses browser `sessionStorage` for the short-lived bearer token. For a production public release, prefer a backend-for-frontend with Secure, HttpOnly, SameSite cookies, a CSRF strategy, rate limits and audited session revocation.
- This is a civic-service prototype, not an official government channel.
