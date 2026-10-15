import type { AuditEvent, Envelope, Evidence, Incident, IncidentAnalysis, User } from './types';

const API_BASE = (import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000/api/v1').replace(/\/+$/, '');

export class ApiError extends Error {
  status: number;
  code?: string;
  details?: unknown;

  constructor(message: string, status: number, code?: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function token(): string | null {
  return sessionStorage.getItem('civicflow_access_token');
}

async function request<T>(path: string, options: RequestInit = {}): Promise<Envelope<T>> {
  const headers = new Headers(options.headers);
  const accessToken = token();
  if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);
  const isForm = options.body instanceof FormData;
  if (options.body && !isForm && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  headers.set('Accept', 'application/json');

  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, { ...options, headers });
  } catch {
    throw new ApiError(`Cannot reach CivicFlow API at ${API_BASE}. Check that the backend is running and VITE_API_BASE_URL is correct.`, 0, 'API_UNREACHABLE');
  }

  const contentType = response.headers.get('content-type') || '';
  const body: unknown = contentType.includes('application/json') ? await response.json().catch(() => null) : await response.text().catch(() => '');
  if (!response.ok) {
    const parsed = body as { error?: { code?: string; message?: string; details?: unknown }; detail?: unknown } | null;
    let message = parsed?.error?.message || (typeof parsed?.detail === 'string' ? parsed.detail : `Request failed with status ${response.status}.`);
    if (parsed?.error?.details && Array.isArray(parsed.error.details) && parsed.error.details.length > 0) {
      const detailsList = parsed.error.details as Array<{ location?: string[]; message?: string; msg?: string }>;
      const detailMessages = detailsList
        .map((d) => {
          const loc = d.location && d.location.length > 1 ? `${d.location[d.location.length - 1]}: ` : '';
          return `${loc}${d.message || d.msg || ''}`.trim();
        })
        .filter(Boolean);
      if (detailMessages.length > 0) {
        message = detailMessages.join(' | ');
      }
    }
    const error = new ApiError(message, response.status, parsed?.error?.code, parsed?.error?.details ?? parsed?.detail);
    if (response.status === 401 && token()) window.dispatchEvent(new CustomEvent('civicflow:unauthorized'));
    throw error;
  }
  return body as Envelope<T>;
}

function jsonBody(value: unknown): string {
  return JSON.stringify(value);
}

export const api = {
  get baseUrl() { return API_BASE; },
  async register(payload: { full_name: string; email: string; password: string }) {
    return (await request<User>('/auth/register', { method: 'POST', body: jsonBody(payload) })).data;
  },
  async login(payload: { email: string; password: string }) {
    return (await request<{ access_token: string; token_type: string; expires_in: number; user: User }>('/auth/login', { method: 'POST', body: jsonBody(payload) })).data;
  },
  async me() {
    return (await request<User>('/auth/me')).data;
  },
  async listIncidents(params: { q?: string; status?: string; page_size?: number } = {}) {
    const query = new URLSearchParams();
    query.set('page', '1');
    query.set('page_size', String(params.page_size ?? 100));
    if (params.q) query.set('q', params.q);
    if (params.status) query.set('status', params.status);
    return request<Incident[]>(`/incidents?${query.toString()}`);
  },
  async getIncident(id: string) {
    return (await request<Incident>(`/incidents/${encodeURIComponent(id)}`)).data;
  },
  async analyze(payload: { description: string; sector?: string }) {
    return (await request<IncidentAnalysis>('/ai/analyze', { method: 'POST', body: jsonBody(payload) })).data;
  },
  async createIncident(payload: {
    description: string; sector: string; title?: string; category?: string; department?: string;
    severity?: string; safety_risk?: boolean; affected_count?: number; location_description?: string;
    latitude?: number; longitude?: number;
  }) {
    return (await request<{ incident: Incident; analysis: IncidentAnalysis; possible_duplicates: Array<{incident_code:string; title:string; reason:string}>; deduplication_note: string }>('/incidents', { method: 'POST', body: jsonBody(payload) })).data;
  },
  async uploadEvidence(incidentId: string, file: File, kind: 'before' | 'after' | 'other', note?: string) {
    const form = new FormData();
    form.append('kind', kind);
    if (note) form.append('note', note);
    form.append('file', file);
    return (await request<Evidence>(`/incidents/${encodeURIComponent(incidentId)}/evidence`, { method: 'POST', body: form })).data;
  },
  async listEvidence(incidentId: string) {
    return (await request<Evidence[]>(`/incidents/${encodeURIComponent(incidentId)}/evidence`)).data;
  },
  async timeline(incidentId: string) {
    return (await request<AuditEvent[]>(`/incidents/${encodeURIComponent(incidentId)}/timeline`)).data;
  },
  async downloadEvidence(incidentId: string, evidenceId: string, filename: string) {
    const headers = new Headers();
    const accessToken = token();
    if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);
    const response = await fetch(`${API_BASE}/incidents/${encodeURIComponent(incidentId)}/evidence/${encodeURIComponent(evidenceId)}/download`, { headers });
    if (!response.ok) throw new ApiError('Unable to download this evidence.', response.status);
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(objectUrl);
  },
  async patchIncident(id: string, payload: Record<string, unknown>) {
    return (await request<Incident>(`/incidents/${encodeURIComponent(id)}`, { method: 'PATCH', body: jsonBody(payload) })).data;
  },
  async listUsers(params: { q?: string; role?: string } = {}) {
    const query = new URLSearchParams();
    if (params.q) query.set('q', params.q);
    if (params.role) query.set('role', params.role);
    return (await request<User[]>(`/auth/users?${query.toString()}`)).data;
  },
  async updateUserPrivilege(payload: { email: string; role: 'citizen' | 'officer' | 'admin' | 'superadmin'; department?: string | null }) {
    return (await request<User>('/auth/users/privilege', { method: 'POST', body: jsonBody(payload) })).data;
  },
  async setUserActive(userId: string, isActive: boolean) {
    return (await request<User>(`/auth/users/${encodeURIComponent(userId)}/status`, { method: 'PATCH', body: jsonBody({ is_active: isActive }) })).data;
  },
};
