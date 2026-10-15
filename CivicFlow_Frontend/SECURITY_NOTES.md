# Security notes

- Do not commit `.env`, access tokens, API keys, database credentials, or citizen evidence.
- Only the public API origin is configured by `VITE_API_BASE_URL`; all secret AI/database credentials remain on the backend.
- The frontend currently stores its bearer token in `sessionStorage`. This is acceptable for a hackathon prototype, but an HttpOnly cookie-based session architecture is preferable before public/production use.
- Do not use real personal information in test incidents. Use fictional descriptions and locations.
- Evidence downloads are requested with the current Bearer token; they are not exposed as public static links.
- Ensure the FastAPI CORS allowlist includes the exact origin where this app runs.
