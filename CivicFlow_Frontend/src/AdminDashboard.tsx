import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Bell,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock3,
  Command,
  Filter,
  LayoutDashboard,
  LogOut,
  MapPin,
  Menu,
  MoreHorizontal,
  RefreshCw,
  Search,
  Settings2,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Users,
  X,
} from 'lucide-react';
import { useAuth } from './auth/AuthContext';
import { api, ApiError } from './api/client';
import type { IncidentAnalysis } from './api/types';
import './AdminDashboard.css';

type Incident = {
  id: string | number;
  incident_code?: string;
  title: string;
  description?: string;
  summary?: string;
  category?: string;
  department?: string;
  severity?: string;
  status?: string;
  priority_score?: number;
  safety_risk?: boolean;
  affected_count?: number;
  sector?: string;
  location_description?: string | null;
  location?: string;
  address?: string;
  latitude?: number | null;
  longitude?: number | null;
  created_at?: string;
  createdAt?: string;
  updated_at?: string;
  recommended_action?: string;
  ai_rationale?: string;
  ai_provider?: string;
  tags?: string[];
  assigned_team?: string | { id?: string | number; name?: string };
  assigned_team_id?: string | number | null;
  team_id?: string | number | null;
  assigned_to_id?: string | number | null;
  reporter?: string | { name?: string; email?: string };
  reported_by?: string | { name?: string; email?: string };
  created_by_id?: string;
  closure_verified?: boolean;
  resolution_notes?: string | null;
  resolved_at?: string | null;
  [key: string]: unknown;
};

type Team = {
  id: string | number;
  name: string;
  department?: string;
  base_sector?: string | null;
  capacity?: number;
  is_active?: boolean;
  [key: string]: unknown;
};

type Notice = {
  type: 'success' | 'error' | 'info';
  message: string;
};

const VALID_TRANSITIONS: Record<string, string[]> = {
  open: ['assigned', 'in_progress'],
  assigned: ['open', 'in_progress'],
  in_progress: ['assigned', 'resolved'],
  resolved: ['closed', 'in_progress'],
  closed: ['in_progress'],
  duplicate: [],
};

const API_BASE = String(import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000/api/v1').replace(/\/+$/, '');

function getToken(): string | null {
  const storages = [sessionStorage, localStorage];
  const keys = ['civicflow_access_token', 'access_token', 'civicflow_token', 'token', 'authToken'];

  for (const store of storages) {
    try {
      for (const key of keys) {
        const val = store.getItem(key);
        if (val && val !== 'undefined' && val !== 'null') {
          return val.replace(/^Bearer\s+/i, '');
        }
      }
      for (const key of ['civicflow_user', 'user', 'auth', 'session']) {
        const val = store.getItem(key);
        if (!val) continue;
        const parsed = JSON.parse(val) as Record<string, unknown>;
        const tok = parsed.access_token ?? parsed.accessToken ?? parsed.token;
        if (typeof tok === 'string' && tok) {
          return tok.replace(/^Bearer\s+/i, '');
        }
      }
    } catch {
      // ignore storage access error
    }
  }
  return null;
}

async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/json');
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  const token = getToken();
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, { ...init, headers });
  } catch {
    throw new Error(`Cannot reach CivicFlow API at ${API_BASE}. Make sure the FastAPI backend is running.`);
  }

  if (!response.ok) {
    let detail = `${response.status} ${response.statusText}`;
    try {
      const body = await response.json() as {
        error?: { code?: string; message?: string; details?: unknown };
        detail?: unknown;
        message?: unknown;
      };

      if (body.error?.message) {
        detail = body.error.message;
        if (Array.isArray(body.error.details) && body.error.details.length > 0) {
          const first = body.error.details[0] as { message?: string; msg?: string };
          if (first?.message || first?.msg) {
            detail += ` (${first.message || first.msg})`;
          }
        }
      } else if (typeof body.detail === 'string') {
        detail = body.detail;
      } else if (body.detail && typeof body.detail === 'object') {
        const d = body.detail as Record<string, unknown>;
        if (typeof d.message === 'string') detail = d.message;
        else if (Array.isArray(body.detail) && body.detail[0]?.msg) {
          detail = String(body.detail[0].msg);
        }
      } else if (typeof body.message === 'string') {
        detail = body.message;
      }
    } catch {
      // Non-JSON response
    }
    throw new Error(detail);
  }

  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

function unwrapList<T>(value: unknown, names: string[]): T[] {
  if (Array.isArray(value)) return value as T[];
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    for (const name of names) {
      if (Array.isArray(record[name])) return record[name] as T[];
    }
    if (record.data) {
      if (Array.isArray(record.data)) return record.data as T[];
      if (typeof record.data === 'object') return unwrapList<T>(record.data, names);
    }
  }
  return [];
}

function textValue(value: unknown, fallback = '—'): string {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (typeof value === 'number') return String(value);
  return fallback;
}

function normalizedStatus(status?: string): string {
  const s = (status || 'open').toLowerCase().replace(/[ _-]+/g, ' ').trim();
  if (['closed', 'complete', 'completed'].includes(s)) return 'closed';
  if (['resolved', 'verified'].includes(s)) return 'resolved';
  if (['in progress', 'inprogress', 'working'].includes(s)) return 'in_progress';
  if (['assigned', 'accepted'].includes(s)) return 'assigned';
  if (['duplicate', 'merged'].includes(s)) return 'duplicate';
  return 'open';
}

function statusLabel(status: string): string {
  const s = normalizedStatus(status);
  switch (s) {
    case 'open': return 'Open';
    case 'assigned': return 'Assigned';
    case 'in_progress': return 'In progress';
    case 'resolved': return 'Resolved';
    case 'closed': return 'Closed';
    case 'duplicate': return 'Duplicate';
    default: return status;
  }
}

function normalizedSeverity(value?: string): string {
  const s = (value || 'medium').toLowerCase();
  if (s.includes('critical') || s.includes('urgent')) return 'critical';
  if (s.includes('high')) return 'high';
  if (s.includes('low')) return 'low';
  return 'medium';
}

function dateLabel(value?: string): string {
  if (!value) return 'Date unavailable';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(date);
}

function relativeTime(value?: string): string {
  if (!value) return 'Recently';
  const time = new Date(value).getTime();
  if (Number.isNaN(time)) return dateLabel(value);
  const hours = Math.max(0, Math.floor((Date.now() - time) / 3600000));
  if (hours < 1) return 'Less than 1h ago';
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function getTeamName(incident: Incident, teams: Team[]): string {
  if (typeof incident.assigned_team === 'string' && incident.assigned_team.trim()) {
    return incident.assigned_team;
  }
  if (incident.assigned_team && typeof incident.assigned_team === 'object' && incident.assigned_team.name) {
    return incident.assigned_team.name;
  }
  const targetId = incident.assigned_team_id ?? incident.team_id;
  if (targetId) {
    const found = teams.find(t => String(t.id) === String(targetId));
    if (found) return found.name;
    return `Team ${String(targetId).slice(0, 8)}`;
  }
  return 'Unassigned';
}

function reportedBy(incident: Incident): string {
  const person = incident.reporter ?? incident.reported_by;
  if (typeof person === 'string' && person.trim()) return person;
  if (person && typeof person === 'object') {
    return textValue(person.name ?? person.email, 'Resident');
  }
  if (incident.created_by_id) {
    return `User ${String(incident.created_by_id).slice(0, 8)}`;
  }
  return 'Resident';
}

function incidentDate(incident: Incident): string | undefined {
  return incident.created_at ?? incident.createdAt;
}

function incidentLocation(incident: Incident): string {
  if (incident.location_description?.trim()) return incident.location_description.trim();
  if (incident.sector?.trim()) {
    if (incident.latitude && incident.longitude) {
      return `${incident.sector} (${incident.latitude.toFixed(2)}, ${incident.longitude.toFixed(2)})`;
    }
    return incident.sector;
  }
  return textValue(incident.location ?? incident.address, 'Location not provided');
}

function incidentCode(incident: Incident): string {
  if (incident.incident_code?.trim()) return incident.incident_code.trim();
  return `CF-${String(incident.id).slice(-6).toUpperCase()}`;
}

export default function AdminDashboard() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [apiError, setApiError] = useState('');
  const [notice, setNotice] = useState<Notice | null>(null);

  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [severityFilter, setSeverityFilter] = useState('all');
  const [departmentFilter, setDepartmentFilter] = useState('all');

  const [selectedIncident, setSelectedIncident] = useState<Incident | null>(null);
  const [nextStatus, setNextStatus] = useState('');
  const [nextTeam, setNextTeam] = useState('');
  const [reviewNote, setReviewNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Quick Resolve State
  const [resolvingIncident, setResolvingIncident] = useState<Incident | null>(null);
  const [resolutionNotes, setResolutionNotes] = useState('Work completed and verified on site by municipal operations.');
  const [resolutionPhoto, setResolutionPhoto] = useState<File | null>(null);
  const [resolvingSaving, setResolvingSaving] = useState(false);

  // AI Suggestion State
  const [aiAnalyzing, setAiAnalyzing] = useState(false);
  const [aiSuggestion, setAiSuggestion] = useState<IncidentAnalysis | null>(null);
  const [aiNotice, setAiNotice] = useState<string | null>(null);

  const searchInputRef = useRef<HTMLInputElement>(null);

  const loadData = useCallback(async (quiet = false) => {
    if (quiet) setRefreshing(true);
    else setLoading(true);
    setApiError('');

    let incidentResult: Incident[] | null = null;
    let lastError: unknown;

    for (const path of ['/incidents?page_size=100', '/incidents', '/incidents/']) {
      try {
        const result = await apiRequest<unknown>(path);
        incidentResult = unwrapList<Incident>(result, ['items', 'incidents', 'results', 'data']);
        break;
      } catch (err) {
        lastError = err;
      }
    }

    if (incidentResult === null) {
      const msg = lastError instanceof Error ? lastError.message : 'Could not load complaints from API.';
      setApiError(msg);
      setIncidents([]);
    } else {
      setIncidents(incidentResult);
    }

    try {
      const teamResult = await apiRequest<unknown>('/teams');
      setTeams(unwrapList<Team>(teamResult, ['items', 'teams', 'results', 'data']));
    } catch {
      setTeams([]);
    }

    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
      if (e.key === 'Escape') {
        setSelectedIncident(null);
        setMobileMenuOpen(false);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const departments = useMemo(() => {
    const list = new Set<string>();
    incidents.forEach(i => {
      if (i.department?.trim()) list.add(i.department.trim());
    });
    return Array.from(list).sort();
  }, [incidents]);

  const filtered = useMemo(() => {
    return incidents.filter((incident) => {
      const fullText = [
        incident.title,
        incident.description,
        incident.summary,
        incident.category,
        incident.department,
        incident.sector,
        incident.location_description,
        incident.location,
        incident.address,
        incidentCode(incident),
        getTeamName(incident, teams),
      ].join(' ').toLowerCase();

      const matchesQuery = !query.trim() || fullText.includes(query.toLowerCase());
      const curStatus = normalizedStatus(incident.status);
      const matchesStatus = statusFilter === 'all' || curStatus === statusFilter;
      const curSeverity = normalizedSeverity(incident.severity);
      const matchesSeverity = severityFilter === 'all' || curSeverity === severityFilter;
      const matchesDept = departmentFilter === 'all' || incident.department === departmentFilter;

      return matchesQuery && matchesStatus && matchesSeverity && matchesDept;
    });
  }, [incidents, query, statusFilter, severityFilter, departmentFilter, teams]);

  const stats = useMemo(() => {
    const active = incidents.filter(i => !['resolved', 'closed', 'duplicate'].includes(normalizedStatus(i.status)));
    const urgent = incidents.filter(i =>
      ['critical', 'high'].includes(normalizedSeverity(i.severity)) &&
      !['resolved', 'closed', 'duplicate'].includes(normalizedStatus(i.status))
    );
    const resolved = incidents.filter(i => normalizedStatus(i.status) === 'resolved').length;
    const closed = incidents.filter(i => normalizedStatus(i.status) === 'closed').length;
    const unassigned = incidents.filter(i =>
      getTeamName(i, teams) === 'Unassigned' &&
      !['resolved', 'closed', 'duplicate'].includes(normalizedStatus(i.status))
    ).length;

    const completed = resolved + closed;
    const rates = incidents.length ? Math.round((completed / incidents.length) * 100) : 0;

    return {
      total: incidents.length,
      active: active.length,
      urgent: urgent.length,
      resolved: completed,
      unassigned,
      rates,
    };
  }, [incidents, teams]);

  const categories = useMemo(() => {
    const tally = new Map<string, number>();
    incidents.forEach(i => {
      const cat = textValue(i.category, 'Other');
      tally.set(cat, (tally.get(cat) || 0) + 1);
    });
    return [...tally.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [incidents]);

  const latest = useMemo(() => {
    return [...incidents]
      .sort((a, b) => new Date(incidentDate(b) || 0).getTime() - new Date(incidentDate(a) || 0).getTime())
      .slice(0, 5);
  }, [incidents]);

  function openReview(incident: Incident) {
    setSelectedIncident(incident);
    setNextStatus(normalizedStatus(incident.status));
    const currentTeamId = incident.assigned_team_id ?? incident.team_id ??
      (typeof incident.assigned_team === 'object' ? incident.assigned_team?.id : '');
    setNextTeam(currentTeamId ? String(currentTeamId) : '');
    setReviewNote('');
    setNotice(null);
    setAiSuggestion(null);
    setAiNotice(null);
  }

  async function handleInlineStatusChange(incident: Incident, targetStatus: string) {
    const current = normalizedStatus(incident.status);
    if (targetStatus === current) return;

    const id = encodeURIComponent(String(incident.id));
    try {
      await apiRequest<unknown>(`/incidents/${id}/status`, {
        method: 'POST',
        body: JSON.stringify({
          status: targetStatus,
          note: `Status changed to ${statusLabel(targetStatus)} via dashboard queue`,
        }),
      });

      setNotice({
        type: 'success',
        message: `Complaint ${incidentCode(incident)} updated to ${statusLabel(targetStatus)}.`,
      });
      await loadData(true);
    } catch (err) {
      setNotice({
        type: 'error',
        message: err instanceof Error ? err.message : 'Could not change status.',
      });
    }
  }

  async function saveReview() {
    if (!selectedIncident) return;
    setSaving(true);
    setNotice(null);

    const id = encodeURIComponent(String(selectedIncident.id));
    const currentStatus = normalizedStatus(selectedIncident.status);
    const currentTeamId = String(
      selectedIncident.assigned_team_id ??
      selectedIncident.team_id ??
      (typeof selectedIncident.assigned_team === 'object' ? selectedIncident.assigned_team?.id : '') ??
      ''
    );

    const failures: string[] = [];
    let updatedAnything = false;

    try {
      if (nextTeam && nextTeam !== currentTeamId) {
        try {
          await apiRequest<unknown>(`/incidents/${id}/assign`, {
            method: 'POST',
            body: JSON.stringify({
              team_id: nextTeam,
              note: reviewNote.trim() || 'Assigned via Admin Dashboard review',
            }),
          });
          updatedAnything = true;
        } catch (err) {
          failures.push(err instanceof Error ? err.message : 'Team assignment failed');
        }
      }

      if (nextStatus && nextStatus !== currentStatus) {
        try {
          await apiRequest<unknown>(`/incidents/${id}/status`, {
            method: 'POST',
            body: JSON.stringify({
              status: nextStatus,
              note: reviewNote.trim() || 'Status updated via Admin Dashboard review',
            }),
          });
          updatedAnything = true;
        } catch (err) {
          failures.push(err instanceof Error ? err.message : 'Status update failed');
        }
      }

      if (failures.length > 0) {
        throw new Error(failures.join(' | '));
      }

      if (updatedAnything) {
        setNotice({ type: 'success', message: `Complaint ${incidentCode(selectedIncident)} updated successfully.` });
        await loadData(true);
        setSelectedIncident(null);
      } else {
        setSelectedIncident(null);
      }
    } catch (error) {
      setNotice({
        type: 'error',
        message: error instanceof Error ? error.message : 'Could not save review changes.',
      });
    } finally {
      setSaving(false);
    }
  }

  function createResolutionCertification(code: string): File {
    const canvas = document.createElement('canvas');
    canvas.width = 400;
    canvas.height = 300;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, 400, 300);
      ctx.fillStyle = '#10b981';
      ctx.fillRect(10, 10, 380, 280);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(16, 16, 368, 268);
      ctx.fillStyle = '#059669';
      ctx.font = 'bold 20px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('CIVICFLOW RESOLUTION PROOF', 200, 70);
      ctx.fillStyle = '#1e293b';
      ctx.font = 'bold 16px sans-serif';
      ctx.fillText(`Complaint: ${code}`, 200, 120);
      ctx.font = '14px sans-serif';
      ctx.fillText('Status: OFFICIAL RESOLUTION VERIFIED', 200, 160);
      ctx.fillText(`Verified on: ${new Date().toLocaleDateString()}`, 200, 190);
      ctx.fillStyle = '#047857';
      ctx.font = 'bold 13px sans-serif';
      ctx.fillText('Certified by Municipal Operations Admin', 200, 240);
    }
    const dataUrl = canvas.toDataURL('image/png');
    const arr = dataUrl.split(',');
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
      u8arr[n] = bstr.charCodeAt(n);
    }
    return new File([u8arr], `resolution-${code}.png`, { type: 'image/png' });
  }

  function openResolveModal(incident: Incident) {
    setResolvingIncident(incident);
    setResolutionNotes(`Work completed and verified on site for complaint ${incidentCode(incident)}.`);
    setResolutionPhoto(null);
    setNotice(null);
  }

  async function handleExecuteResolve() {
    if (!resolvingIncident) return;
    setResolvingSaving(true);
    const id = encodeURIComponent(String(resolvingIncident.id));
    const code = incidentCode(resolvingIncident);
    try {
      const curStatus = normalizedStatus(resolvingIncident.status);
      if (curStatus === 'open') {
        try {
          await apiRequest(`/incidents/${id}/status`, {
            method: 'POST',
            body: JSON.stringify({
              status: 'in_progress',
              note: 'Automatic transition to in_progress for resolution',
            }),
          });
        } catch {
          // Continue if already transitioned
        }
      }

      const fileToUpload = resolutionPhoto || createResolutionCertification(code);
      await api.uploadEvidence(String(resolvingIncident.id), fileToUpload, 'after', resolutionNotes);

      await apiRequest(`/incidents/${id}/verify-closure`, {
        method: 'POST',
        body: JSON.stringify({ verified: true, notes: resolutionNotes || 'Closure verified by admin' }),
      });

      await apiRequest(`/incidents/${id}/status`, {
        method: 'POST',
        body: JSON.stringify({ status: 'resolved', note: resolutionNotes || 'Resolved by admin' }),
      });

      setNotice({
        type: 'success',
        message: `Complaint ${code} has been successfully marked as RESOLVED!`,
      });
      setResolvingIncident(null);
      setSelectedIncident(null);
      setResolutionPhoto(null);
      await loadData(true);
    } catch (err) {
      setNotice({
        type: 'error',
        message: err instanceof Error ? err.message : 'Could not resolve complaint.',
      });
    } finally {
      setResolvingSaving(false);
    }
  }

  // Run AI Triage Suggestion for Admin
  async function handleSuggestWithAI(target?: Incident) {
    const inc = target || selectedIncident;
    if (!inc) return;
    const desc = inc.description || inc.title || '';
    if (desc.trim().length < 5) {
      setNotice({ type: 'info', message: 'Complaint description is too short for AI analysis.' });
      return;
    }
    setAiAnalyzing(true);
    setAiNotice(null);
    try {
      const analysis = await api.analyze({
        description: desc,
        sector: inc.sector,
      });
      setAiSuggestion(analysis);
      setAiNotice(`AI analysis complete via ${analysis.provider}. Review recommendations below.`);
    } catch (err) {
      const apiErr = err as ApiError;
      setNotice({ type: 'error', message: apiErr.message || 'AI analysis could not be completed.' });
    } finally {
      setAiAnalyzing(false);
    }
  }

  // Apply AI triage suggestions to current review form
  function handleApplyAISuggestions(analysis: IncidentAnalysis) {
    if (!selectedIncident) return;

    // Find recommended team for department
    const matchingTeam = teams.find(
      (t) =>
        t.department &&
        analysis.department &&
        t.department.toLowerCase() === analysis.department.toLowerCase()
    );
    if (matchingTeam) {
      setNextTeam(String(matchingTeam.id));
    }

    // Append AI recommendation to review notes
    const aiNote = `[AI Recommendation - Action: ${analysis.recommended_action}]`;
    setReviewNote((prev) => (prev.trim() ? `${prev}\n${aiNote}` : aiNote));

    // Update in-memory selected complaint state
    setSelectedIncident((prev) =>
      prev
        ? {
            ...prev,
            category: analysis.category,
            department: analysis.department,
            severity: analysis.severity,
            safety_risk: analysis.safety_risk,
            recommended_action: analysis.recommended_action,
            ai_rationale: analysis.rationale,
            ai_provider: analysis.provider,
          }
        : null
    );

    setNotice({
      type: 'success',
      message: 'AI recommendations applied to workflow form. Click "Save changes" or "Save to Complaint" to persist.',
    });
  }

  // Persist AI changes directly to the complaint record
  async function handleSaveAIToComplaint(analysis: IncidentAnalysis) {
    if (!selectedIncident) return;
    setSaving(true);
    try {
      const updated = await api.patchIncident(String(selectedIncident.id), {
        category: analysis.category,
        department: analysis.department,
        severity: analysis.severity,
        safety_risk: analysis.safety_risk,
      });

      setIncidents((prev) =>
        prev.map((inc) =>
          String(inc.id) === String(selectedIncident.id) ? { ...inc, ...updated } : inc
        )
      );
      setSelectedIncident((prev) => (prev ? { ...prev, ...updated } : null));

      setNotice({
        type: 'success',
        message: `AI classification saved directly to Complaint ${incidentCode(selectedIncident)}.`,
      });
    } catch (err) {
      const apiErr = err as ApiError;
      setNotice({
        type: 'error',
        message: apiErr.message || 'Failed to save AI suggestions to database.',
      });
    } finally {
      setSaving(false);
    }
  }

  function handleSignOut() {
    signOut();
    navigate('/login');
  }

  const userInitial = user?.full_name ? user.full_name.slice(0, 2).toUpperCase() : 'CF';
  const allowedTransitionsForSelected = selectedIncident
    ? VALID_TRANSITIONS[normalizedStatus(selectedIncident.status)] || []
    : [];

  return (
    <div className="cfadmin-shell">
      {/* Sidebar */}
      <aside className={`cfadmin-sidebar ${mobileMenuOpen ? 'is-open' : ''}`}>
        <div className="cfadmin-brand">
          <span className="cfadmin-brand-mark">
            <Command size={21} strokeWidth={2.4} />
          </span>
          <span>
            CivicFlow
            <span className="cfadmin-brand-sub">ADMIN OPERATIONS</span>
          </span>
          <button
            className="cfadmin-icon-button cfadmin-mobile-close"
            onClick={() => setMobileMenuOpen(false)}
            aria-label="Close menu"
          >
            <X size={18} />
          </button>
        </div>

        <div className="cfadmin-workspace">
          <span className="cfadmin-workspace-dot" />
          <span>
            <strong>City Operations</strong>
            <small>Admin workspace · Chandigarh</small>
          </span>
          <ChevronDown size={15} />
        </div>

        <div className="cfadmin-nav-label">OPERATIONS</div>
        <nav className="cfadmin-nav">
          <button
            className="cfadmin-nav-btn active"
            onClick={() => {
              setMobileMenuOpen(false);
            }}
          >
            <LayoutDashboard size={18} /> Overview
            <span className="cfadmin-nav-active" />
          </button>
          <button
            className="cfadmin-nav-btn"
            onClick={() => {
              setStatusFilter('all');
              setSeverityFilter('all');
              setDepartmentFilter('all');
              setMobileMenuOpen(false);
            }}
          >
            <AlertCircle size={18} /> All complaints{' '}
            <span className="cfadmin-nav-count">{stats.total}</span>
          </button>
          <button
            className="cfadmin-nav-btn"
            onClick={() => {
              setStatusFilter('open');
              setSeverityFilter('all');
              setMobileMenuOpen(false);
            }}
          >
            <Clock3 size={18} /> Needs attention{' '}
            <span className="cfadmin-nav-count amber">{stats.unassigned}</span>
          </button>
          <button
            className="cfadmin-nav-btn"
            onClick={() => {
              setMobileMenuOpen(false);
            }}
          >
            <Users size={18} /> Field Teams{' '}
            <span className="cfadmin-nav-count">{teams.length}</span>
          </button>
          <button
            className="cfadmin-nav-btn"
            onClick={() => {
              setMobileMenuOpen(false);
            }}
          >
            <Activity size={18} /> Insights
          </button>
        </nav>

        <div className="cfadmin-nav-label cfadmin-nav-label-bottom">SYSTEM</div>
        <nav className="cfadmin-nav">
          <button
            className="cfadmin-nav-btn"
            onClick={() => {
              setNotice({
                type: 'info',
                message: `Active environment API base: ${API_BASE}. Logged in role: ${user?.role || 'administrator'}.`,
              });
            }}
          >
            <Settings2 size={18} /> API Settings
          </button>
          <button
            className="cfadmin-nav-btn"
            onClick={() => {
              setNotice({
                type: 'info',
                message: `Privilege: ${(user?.role || 'admin').toUpperCase()}. Department: ${user?.department || 'Citywide / Operations'}.`,
              });
            }}
          >
            <ShieldCheck size={18} /> Permissions
          </button>
        </nav>

        <div className="cfadmin-sidebar-bottom">
          <div className="cfadmin-avatar">{userInitial}</div>
          <div className="cfadmin-admin-person">
            <strong>{user?.full_name || 'Operations Admin'}</strong>
            <small>{(user?.role || 'ADMIN').toUpperCase()} · {user?.department || 'Operations'}</small>
          </div>
          <button
            className="cfadmin-icon-button"
            title="Sign out of CivicFlow"
            onClick={handleSignOut}
          >
            <LogOut size={17} />
          </button>
        </div>
      </aside>

      {mobileMenuOpen && (
        <button
          className="cfadmin-mobile-backdrop"
          aria-label="Close navigation"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Main content */}
      <main className="cfadmin-main" id="overview">
        <header className="cfadmin-topbar">
          <div className="cfadmin-topbar-left">
            <button
              className="cfadmin-icon-button cfadmin-menu-toggle"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Open menu"
            >
              <Menu size={20} />
            </button>
            <span className="cfadmin-breadcrumb-muted">Admin Portal</span>
            <ChevronRight size={14} />
            <strong>Operations Overview</strong>
          </div>
          <div className="cfadmin-topbar-actions">
            <span className="cfadmin-live-indicator">
              <span /> System operational
            </span>
            <button
              className="cfadmin-icon-button"
              aria-label="Notifications"
              onClick={() =>
                setNotice({
                  type: 'info',
                  message: `${stats.active} open complaints, ${stats.urgent} high priority requiring review.`,
                })
              }
            >
              <Bell size={18} />
              {stats.urgent > 0 && <i />}
            </button>
            <div className="cfadmin-top-avatar">{userInitial}</div>
          </div>
        </header>

        <div className="cfadmin-content">
          {/* Notices and Alerts */}
          {notice && (
            <div className={`cfadmin-notice ${notice.type}`} role="status">
              <span>{notice.message}</span>
              <button onClick={() => setNotice(null)} aria-label="Dismiss message">
                <X size={16} />
              </button>
            </div>
          )}

          {apiError && (
            <div className="cfadmin-api-alert">
              <AlertTriangle size={19} />
              <div>
                <strong>Could not load complaints from API</strong>
                <p>
                  {apiError}. Make sure the FastAPI server is running on {API_BASE} and your session token is valid.
                </p>
              </div>
              <button
                className="cfadmin-button cfadmin-button-secondary"
                onClick={() => void loadData(true)}
              >
                Try again
              </button>
            </div>
          )}

          <section className="cfadmin-page-heading">
                <div>
                  <div className="cfadmin-eyebrow">CIVIC SERVICE CONTROL CENTER</div>
                  <h1>
                    Operations overview<span>.</span>
                  </h1>
                  <p>Monitor incoming citizen reports, coordinate municipal teams, and accelerate resolution.</p>
                </div>
                <div className="cfadmin-heading-actions">
                  <span className="cfadmin-updated-label">
                    <span className="cfadmin-status-dot" /> Live API connected
                  </span>
                  <button
                    className="cfadmin-button cfadmin-button-secondary"
                    onClick={() => void loadData(true)}
                    disabled={refreshing}
                  >
                    <RefreshCw size={16} className={refreshing ? 'cfadmin-spin' : ''} />{' '}
                    {refreshing ? 'Refreshing…' : 'Refresh data'}
                  </button>
                </div>
              </section>

              {/* Metric cards */}
              <section className="cfadmin-stat-grid" aria-label="Complaint summary">
                <StatCard
                  label="Total complaints"
                  value={loading ? '—' : stats.total.toLocaleString()}
                  sub="All recorded reports"
                  icon={<Activity size={19} />}
                  tone="blue"
                />
                <StatCard
                  label="Open issues"
                  value={loading ? '—' : stats.active.toLocaleString()}
                  sub="Pending resolution"
                  icon={<Clock3 size={19} />}
                  tone="violet"
                  trend={stats.active > 0 ? `${stats.active} active` : 'Queue clear'}
                />
                <StatCard
                  label="High priority"
                  value={loading ? '—' : stats.urgent.toLocaleString()}
                  sub="High or critical severity"
                  icon={<AlertTriangle size={19} />}
                  tone="orange"
                  highlight={stats.urgent > 0}
                />
                <StatCard
                  label="Resolved / Closed"
                  value={loading ? '—' : stats.resolved.toLocaleString()}
                  sub={`${stats.rates}% resolution rate`}
                  icon={<CheckCircle2 size={19} />}
                  tone="green"
                />
              </section>

              {/* Middle Insights Grid */}
              <section className="cfadmin-middle-grid" id="insights">
                <div className="cfadmin-panel cfadmin-queue-panel">
                  <div className="cfadmin-panel-heading">
                    <div>
                      <h2>Complaint activity</h2>
                      <p>Current distribution by workflow status</p>
                    </div>
                    <span className="cfadmin-panel-chip">All time</span>
                  </div>
                  <div className="cfadmin-activity-layout">
                    <div className="cfadmin-ring-wrap">
                      <div
                        className="cfadmin-ring"
                        style={
                          {
                            '--resolved-angle': `${stats.total ? (stats.resolved / stats.total) * 360 : 0}deg`,
                          } as React.CSSProperties
                        }
                      >
                        <div>
                          <strong>{loading ? '—' : stats.total}</strong>
                          <span>Total reports</span>
                        </div>
                      </div>
                      <div className="cfadmin-ring-caption">
                        <span className="cfadmin-legend-dot resolved" />
                        Resolved share ({stats.rates}%)
                      </div>
                    </div>
                    <div className="cfadmin-status-list">
                      <StatusMeter
                        label="Open"
                        value={incidents.filter(i => normalizedStatus(i.status) === 'open').length}
                        total={stats.total}
                        color="blue"
                      />
                      <StatusMeter
                        label="Assigned"
                        value={incidents.filter(i => normalizedStatus(i.status) === 'assigned').length}
                        total={stats.total}
                        color="violet"
                      />
                      <StatusMeter
                        label="In progress"
                        value={incidents.filter(i => normalizedStatus(i.status) === 'in_progress').length}
                        total={stats.total}
                        color="orange"
                      />
                      <StatusMeter
                        label="Resolved / Closed"
                        value={stats.resolved}
                        total={stats.total}
                        color="green"
                      />
                    </div>
                  </div>
                </div>

                <div className="cfadmin-panel" id="teams">
                  <div className="cfadmin-panel-heading">
                    <div>
                      <h2>Top issue categories</h2>
                      <p>Distribution of citizen reported issues</p>
                    </div>
                    <SlidersHorizontal size={17} className="cfadmin-muted-icon" />
                  </div>
                  {categories.length ? (
                    <div className="cfadmin-category-list">
                      {categories.map(([name, count], index) => (
                        <div className="cfadmin-category-row" key={name}>
                          <div className="cfadmin-category-top">
                            <span className={`cfadmin-category-icon c${index}`}>
                              {index === 0 ? (
                                <MapPin size={16} />
                              ) : index === 1 ? (
                                <AlertCircle size={16} />
                              ) : index === 2 ? (
                                <Activity size={16} />
                              ) : (
                                <Command size={16} />
                              )}
                            </span>
                            <span className="cfadmin-category-name">{name}</span>
                            <strong>{count}</strong>
                          </div>
                          <div className="cfadmin-progress-track">
                            <span
                              className={`c${index}`}
                              style={{
                                width: `${Math.max(5, (count / (categories[0]?.[1] || 1)) * 100)}%`,
                              }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <EmptyState
                      loading={loading}
                      text="Category insights will appear when incidents are available."
                    />
                  )}
                </div>
              </section>

              {/* Incidents Table */}
              <section className="cfadmin-panel cfadmin-incidents-panel" id="incidents">
                <div className="cfadmin-panel-heading cfadmin-incidents-heading">
                  <div>
                    <h2>
                      Complaint queue <span className="cfadmin-count-pill">{filtered.length}</span>
                    </h2>
                    <p>Review reports, reassign teams, and update lifecycle statuses.</p>
                  </div>
                  <div className="cfadmin-incident-tools">
                    <label className="cfadmin-search">
                      <Search size={16} />
                      <input
                        ref={searchInputRef}
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Search complaints, sectors, IDs…"
                        aria-label="Search complaints"
                      />
                      <kbd>⌘ K</kbd>
                    </label>

                    <label className="cfadmin-select-wrap">
                      <Filter size={15} />
                      <select
                        aria-label="Filter by status"
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                      >
                        <option value="all">All statuses</option>
                        <option value="open">Open</option>
                        <option value="assigned">Assigned</option>
                        <option value="in_progress">In progress</option>
                        <option value="resolved">Resolved</option>
                        <option value="closed">Closed</option>
                        <option value="duplicate">Duplicate</option>
                      </select>
                      <ChevronDown size={14} />
                    </label>

                    <label className="cfadmin-select-wrap cfadmin-severity-filter">
                      <select
                        aria-label="Filter by severity"
                        value={severityFilter}
                        onChange={(e) => setSeverityFilter(e.target.value)}
                      >
                        <option value="all">Any priority</option>
                        <option value="critical">Critical</option>
                        <option value="high">High</option>
                        <option value="medium">Medium</option>
                        <option value="low">Low</option>
                      </select>
                      <ChevronDown size={14} />
                    </label>

                    {departments.length > 0 && (
                      <label className="cfadmin-select-wrap">
                        <select
                          aria-label="Filter by department"
                          value={departmentFilter}
                          onChange={(e) => setDepartmentFilter(e.target.value)}
                        >
                          <option value="all">All departments</option>
                          {departments.map((dept) => (
                            <option key={dept} value={dept}>
                              {dept}
                            </option>
                          ))}
                        </select>
                        <ChevronDown size={14} />
                      </label>
                    )}
                  </div>
                </div>

                <div className="cfadmin-table-scroll">
                  <table className="cfadmin-table">
                    <thead>
                      <tr>
                        <th>COMPLAINT</th>
                        <th>CATEGORY & DEPT</th>
                        <th>PRIORITY</th>
                        <th>STATUS</th>
                        <th>ASSIGNED TEAM</th>
                        <th>REPORTED</th>
                        <th>
                          <span className="cfadmin-sr-only">Actions</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {loading ? (
                        Array.from({ length: 4 }, (_, i) => (
                          <tr key={i}>
                            <td colSpan={7}>
                              <div className="cfadmin-skeleton" />
                            </td>
                          </tr>
                        ))
                      ) : filtered.length ? (
                        filtered.slice(0, 15).map((incident) => {
                          const curStatus = normalizedStatus(incident.status);
                          const assignedTeamLabel = getTeamName(incident, teams);
                          const transitions = VALID_TRANSITIONS[curStatus] || [];

                          return (
                            <tr key={String(incident.id)}>
                              <td>
                                <button
                                  className="cfadmin-incident-title"
                                  onClick={() => openReview(incident)}
                                >
                                  <span className="cfadmin-incident-id">
                                    {incidentCode(incident)}
                                  </span>
                                  <strong>{textValue(incident.title, 'Untitled complaint')}</strong>
                                  <small>
                                    <MapPin size={12} /> {incidentLocation(incident)}
                                  </small>
                                </button>
                              </td>
                              <td>
                                <span className="cfadmin-category-cell">
                                  {textValue(incident.category, 'Other')}
                                </span>
                                {incident.department && (
                                  <small style={{ display: 'block', color: '#909db0', fontSize: '9px' }}>
                                    {incident.department}
                                  </small>
                                )}
                              </td>
                              <td>
                                <SeverityBadge severity={normalizedSeverity(incident.severity)} />
                                {incident.safety_risk && (
                                  <span
                                    className="cfadmin-safety-pill"
                                    style={{ marginLeft: '4px' }}
                                    title="Safety risk reported"
                                  >
                                    <ShieldAlert size={10} /> Risk
                                  </span>
                                )}
                              </td>
                              <td>
                                <select
                                  className="cfadmin-inline-status-select"
                                  aria-label={`Change status for complaint ${incidentCode(incident)}`}
                                  value={curStatus}
                                  onChange={(e) => void handleInlineStatusChange(incident, e.target.value)}
                                >
                                  <option value={curStatus}>{statusLabel(curStatus)} (current)</option>
                                  {transitions.map((trans) => (
                                    <option key={trans} value={trans}>
                                      → {statusLabel(trans)}
                                    </option>
                                  ))}
                                </select>
                              </td>
                              <td>
                                <div
                                  className={`cfadmin-team-cell ${
                                    assignedTeamLabel === 'Unassigned' ? 'unassigned' : ''
                                  }`}
                                >
                                  <span>
                                    {assignedTeamLabel === 'Unassigned'
                                      ? '—'
                                      : assignedTeamLabel.slice(0, 1).toUpperCase()}
                                  </span>
                                  {assignedTeamLabel}
                                </div>
                              </td>
                              <td>
                                <span className="cfadmin-date-cell">
                                  {relativeTime(incidentDate(incident))}
                                </span>
                                <small className="cfadmin-date-sub">
                                  {dateLabel(incidentDate(incident))}
                                </small>
                              </td>
                              <td>
                                <div className="cfadmin-actions-cell">
                                  <button
                                    className="cfadmin-ai-suggest-btn"
                                    onClick={() => {
                                      openReview(incident);
                                      void handleSuggestWithAI(incident);
                                    }}
                                    title="Suggest triage with AI"
                                  >
                                    <Sparkles size={12} /> AI Suggest
                                  </button>
                                  {curStatus === 'resolved' ? (
                                    <span className="cfadmin-resolved-badge" title="Incident is resolved">
                                      <Check size={12} /> Resolved
                                    </span>
                                  ) : curStatus === 'closed' ? (
                                    <span className="cfadmin-closed-badge">Closed</span>
                                  ) : (
                                    <button
                                      className="cfadmin-resolve-action-btn"
                                      onClick={() => openResolveModal(incident)}
                                      title="Mark as Resolved"
                                    >
                                      <CheckCircle2 size={13} /> Resolve
                                    </button>
                                  )}
                                  <button
                                    className="cfadmin-row-action"
                                    onClick={() => openReview(incident)}
                                    aria-label={`Review complaint ${incidentCode(incident)}`}
                                    title="Review and dispatch"
                                  >
                                    <ChevronRight size={17} />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })
                      ) : (
                        <tr>
                          <td colSpan={7}>
                            <EmptyState
                              loading={false}
                              text={
                                incidents.length
                                  ? 'No complaints match these filters.'
                                  : 'No complaint records were returned by the API.'
                              }
                            />
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                <div className="cfadmin-table-footer">
                  <span>
                    Showing <strong>{Math.min(filtered.length, 15)}</strong> of{' '}
                    <strong>{filtered.length}</strong> matching complaints
                  </span>
                  <button
                    className="cfadmin-view-all"
                    onClick={() => {
                      setStatusFilter('all');
                      setSeverityFilter('all');
                      setDepartmentFilter('all');
                      setQuery('');
                    }}
                  >
                    Clear all filters <ArrowUpRight size={14} />
                  </button>
                </div>
              </section>

              {/* Bottom Grid */}
              <section className="cfadmin-bottom-grid">
                <div className="cfadmin-panel">
                  <div className="cfadmin-panel-heading">
                    <div>
                      <h2>Latest reports</h2>
                      <p>Most recently submitted civic issues</p>
                    </div>
                    <Clock3 size={17} className="cfadmin-muted-icon" />
                  </div>
                  <div className="cfadmin-latest-list">
                    {latest.length ? (
                      latest.map((item) => (
                        <button
                          className="cfadmin-latest-item"
                          key={String(item.id)}
                          onClick={() => openReview(item)}
                        >
                          <span
                            className={`cfadmin-latest-marker ${normalizedSeverity(item.severity)}`}
                          >
                            <AlertCircle size={16} />
                          </span>
                          <span className="cfadmin-latest-copy">
                            <strong>{textValue(item.title, 'Untitled complaint')}</strong>
                            <small>
                              {textValue(item.category, 'Other')} · {relativeTime(incidentDate(item))}
                            </small>
                          </span>
                          <StatusBadge status={normalizedStatus(item.status)} />
                        </button>
                      ))
                    ) : (
                      <EmptyState loading={loading} text="New reports will appear here." />
                    )}
                  </div>
                </div>

                <div className="cfadmin-panel cfadmin-response-panel">
                  <div className="cfadmin-panel-heading">
                    <div>
                      <h2>Operations snapshot</h2>
                      <p>Current coordinator action items</p>
                    </div>
                    <Activity size={17} className="cfadmin-muted-icon" />
                  </div>
                  <div className="cfadmin-snapshot-list">
                    <div className="cfadmin-snapshot-row">
                      <span className="cfadmin-snapshot-icon amber">
                        <Users size={17} />
                      </span>
                      <span>
                        <strong>Unassigned complaints</strong>
                        <small>Awaiting municipal field team</small>
                      </span>
                      <b>{loading ? '—' : stats.unassigned}</b>
                    </div>
                    <div className="cfadmin-snapshot-row">
                      <span className="cfadmin-snapshot-icon red">
                        <AlertTriangle size={17} />
                      </span>
                      <span>
                        <strong>High priority open</strong>
                        <small>High or critical urgency</small>
                      </span>
                      <b>{loading ? '—' : stats.urgent}</b>
                    </div>
                    <div className="cfadmin-snapshot-row">
                      <span className="cfadmin-snapshot-icon green">
                        <CheckCircle2 size={17} />
                      </span>
                      <span>
                        <strong>Resolution rate</strong>
                        <small>Resolved or closed of all recorded</small>
                      </span>
                      <b>{loading ? '—' : `${stats.rates}%`}</b>
                    </div>
                  </div>
                  <div className="cfadmin-snapshot-note">
                    <AlertCircle size={15} />
                    <span>
                      Metrics update live from connected database records accessible to your role.
                    </span>
                  </div>
                </div>
              </section>

          <footer className="cfadmin-footer">
            <span>© {new Date().getFullYear()} CivicFlow Operations · Chandigarh</span>
            <span>
              <span className="cfadmin-status-dot" /> Live API connected · Admin Portal View
            </span>
          </footer>
        </div>
      </main>

      {/* Review & Edit Modal (Admin Operations) */}
      {selectedIncident && (
        <div
          className="cfadmin-modal-backdrop"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setSelectedIncident(null);
          }}
        >
          <section
            className="cfadmin-review-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="cfadmin-review-title"
          >
            <header className="cfadmin-review-head">
              <div>
                <span className="cfadmin-eyebrow">
                  COMPLAINT REVIEW · {incidentCode(selectedIncident)}
                </span>
                <h2 id="cfadmin-review-title">
                  {textValue(selectedIncident.title, 'Untitled complaint')}
                </h2>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button
                  type="button"
                  className="cfadmin-modal-ai-btn"
                  disabled={aiAnalyzing}
                  onClick={() => void handleSuggestWithAI()}
                  title="Run automated AI triage analysis"
                >
                  <Sparkles size={14} className={aiAnalyzing ? 'cfadmin-spin' : ''} />
                  {aiAnalyzing ? 'Analyzing with AI…' : aiSuggestion ? 'Analyze Again' : 'Suggest with AI'}
                </button>
                <button
                  className="cfadmin-icon-button"
                  onClick={() => {
                    setSelectedIncident(null);
                    setAiSuggestion(null);
                    setAiNotice(null);
                  }}
                  aria-label="Close review"
                >
                  <X size={19} />
                </button>
              </div>
            </header>

            <div className="cfadmin-review-body">
              {aiNotice && (
                <div style={{ padding: '8px 12px', background: '#ede9fe', border: '1px solid #c4b5fd', borderRadius: '8px', color: '#5b21b6', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Sparkles size={13} />
                  <span>{aiNotice}</span>
                </div>
              )}

              <div className="cfadmin-review-tags">
                <StatusBadge status={normalizedStatus(selectedIncident.status)} />
                <SeverityBadge severity={normalizedSeverity(selectedIncident.severity)} />
                <span className="cfadmin-review-category">
                  {textValue(selectedIncident.category, 'Other')}
                </span>
                {selectedIncident.department && (
                  <span className="cfadmin-dept-pill">{selectedIncident.department}</span>
                )}
                {selectedIncident.safety_risk && (
                  <span className="cfadmin-safety-pill">
                    <ShieldAlert size={11} /> Safety Risk Flagged
                  </span>
                )}
              </div>

              <p className="cfadmin-review-description">
                {textValue(
                  selectedIncident.description,
                  'No description was provided for this complaint.'
                )}
              </p>

              {/* Interactive AI Triage Suggestion Panel */}
              {aiSuggestion ? (
                <div className="cfadmin-ai-interactive-card">
                  <div className="cfadmin-ai-interactive-head">
                    <div className="cfadmin-ai-interactive-title">
                      <Sparkles size={15} />
                      <span>AI TRIAGE RECOMMENDATION ({aiSuggestion.provider.toUpperCase()})</span>
                    </div>
                    <button
                      type="button"
                      className="cfadmin-ai-apply-all-btn"
                      onClick={() => handleApplyAISuggestions(aiSuggestion)}
                      title="Apply all suggested values to current form"
                    >
                      <Check size={14} /> Apply All Suggestions
                    </button>
                  </div>

                  <div className="cfadmin-ai-badges-row">
                    <div className="cfadmin-ai-pill-item">
                      <span>Category:</span>
                      <strong>{aiSuggestion.category}</strong>
                      <button
                        type="button"
                        className="cfadmin-ai-apply-small-btn"
                        onClick={() => {
                          setSelectedIncident((prev) => (prev ? { ...prev, category: aiSuggestion.category } : null));
                          setNotice({ type: 'info', message: `Category updated to "${aiSuggestion.category}".` });
                        }}
                      >
                        Apply
                      </button>
                    </div>

                    <div className="cfadmin-ai-pill-item">
                      <span>Department:</span>
                      <strong>{aiSuggestion.department}</strong>
                      <button
                        type="button"
                        className="cfadmin-ai-apply-small-btn"
                        onClick={() => {
                          setSelectedIncident((prev) => (prev ? { ...prev, department: aiSuggestion.department } : null));
                          const m = teams.find(
                            (t) => t.department && t.department.toLowerCase() === aiSuggestion.department.toLowerCase()
                          );
                          if (m) setNextTeam(String(m.id));
                          setNotice({ type: 'info', message: `Department set to "${aiSuggestion.department}".` });
                        }}
                      >
                        Apply
                      </button>
                    </div>

                    <div className="cfadmin-ai-pill-item">
                      <span>Severity:</span>
                      <strong>{aiSuggestion.severity.toUpperCase()}</strong>
                      <button
                        type="button"
                        className="cfadmin-ai-apply-small-btn"
                        onClick={() => {
                          setSelectedIncident((prev) => (prev ? { ...prev, severity: aiSuggestion.severity } : null));
                          setNotice({ type: 'info', message: `Severity updated to "${aiSuggestion.severity}".` });
                        }}
                      >
                        Apply
                      </button>
                    </div>

                    {aiSuggestion.safety_risk && (
                      <span className="cfadmin-safety-pill" style={{ margin: 0 }}>
                        <ShieldAlert size={12} /> Potential Safety Risk
                      </span>
                    )}
                  </div>

                  {aiSuggestion.recommended_action && (
                    <div className="cfadmin-ai-action-callout">
                      <strong>Recommended Next Action:</strong> {aiSuggestion.recommended_action}
                    </div>
                  )}

                  {aiSuggestion.rationale && (
                    <div className="cfadmin-ai-interactive-body">
                      <strong>Decision Rationale:</strong> {aiSuggestion.rationale}
                    </div>
                  )}

                  {aiSuggestion.warnings?.length > 0 && (
                    <div style={{ color: '#b45309', fontSize: '11px', marginTop: '6px' }}>
                      {aiSuggestion.warnings.map((w, idx) => (
                        <div key={idx}>⚠️ {w}</div>
                      ))}
                    </div>
                  )}

                  <div style={{ marginTop: '10px', display: 'flex', gap: '8px' }}>
                    <button
                      type="button"
                      className="cfadmin-button cfadmin-button-secondary"
                      style={{ fontSize: '11px', padding: '5px 10px' }}
                      onClick={() => void handleSaveAIToComplaint(aiSuggestion)}
                      disabled={saving}
                    >
                      <CheckCircle2 size={13} /> Save directly to Complaint record
                    </button>
                  </div>
                </div>
              ) : (selectedIncident.recommended_action || selectedIncident.ai_rationale) ? (
                <div className="cfadmin-review-ai-box">
                  <div className="cfadmin-review-ai-box-head">
                    <Sparkles size={14} />
                    <span>AI-ASSISTED TRIAGE RECORD</span>
                  </div>
                  {selectedIncident.recommended_action && (
                    <p>
                      <strong>Action:</strong> {selectedIncident.recommended_action}
                    </p>
                  )}
                  {selectedIncident.ai_rationale && (
                    <small>{selectedIncident.ai_rationale}</small>
                  )}
                  <small style={{ marginTop: '4px', opacity: 0.8 }}>
                    Provider: {selectedIncident.ai_provider || 'CivicFlow AI Engine'} · Decision support only
                  </small>
                  <div style={{ marginTop: '8px' }}>
                    <button
                      type="button"
                      className="cfadmin-button cfadmin-button-secondary"
                      style={{ fontSize: '11px', padding: '4px 8px' }}
                      onClick={() => void handleSuggestWithAI()}
                    >
                      <Sparkles size={12} /> Re-analyze with Latest AI Model
                    </button>
                  </div>
                </div>
              ) : (
                <div
                  style={{
                    margin: '12px 0 16px',
                    padding: '12px 14px',
                    background: '#f8fafc',
                    borderRadius: '9px',
                    border: '1px dashed #cbd5e1',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#64748b' }}>
                    <Sparkles size={16} color="#7c3aed" />
                    <span>Generate AI classification, severity, and action advice for this report.</span>
                  </div>
                  <button
                    type="button"
                    className="cfadmin-ai-suggest-btn"
                    onClick={() => void handleSuggestWithAI()}
                    disabled={aiAnalyzing}
                  >
                    <Sparkles size={12} /> Suggest with AI
                  </button>
                </div>
              )}

              <div className="cfadmin-review-meta">
                <div>
                  <span>Reported by</span>
                  <strong>{reportedBy(selectedIncident)}</strong>
                </div>
                <div>
                  <span>Reported on</span>
                  <strong>{dateLabel(incidentDate(selectedIncident))}</strong>
                </div>
                <div>
                  <span>Location</span>
                  <strong>{incidentLocation(selectedIncident)}</strong>
                </div>
              </div>

              {/* Status Update Field */}
              <div className="cfadmin-form-field">
                <label htmlFor="cfadmin-status">Update workflow status</label>
                <select
                  id="cfadmin-status"
                  value={nextStatus}
                  onChange={(e) => setNextStatus(e.target.value)}
                >
                  <option value={normalizedStatus(selectedIncident.status)}>
                    {statusLabel(normalizedStatus(selectedIncident.status))} (Current)
                  </option>
                  {allowedTransitionsForSelected.map((statusKey) => (
                    <option key={statusKey} value={statusKey}>
                      → Transition to: {statusLabel(statusKey)}
                    </option>
                  ))}
                  <optgroup label="Other statuses (may require specific conditions)">
                    {['open', 'assigned', 'in_progress', 'resolved', 'closed']
                      .filter(
                        (s) =>
                          s !== normalizedStatus(selectedIncident.status) &&
                          !allowedTransitionsForSelected.includes(s)
                      )
                      .map((s) => (
                        <option key={s} value={s}>
                          {statusLabel(s)}
                        </option>
                      ))}
                  </optgroup>
                </select>
                <small>
                  Valid next steps from {statusLabel(normalizedStatus(selectedIncident.status))}:{' '}
                  {allowedTransitionsForSelected.map(statusLabel).join(', ') || 'None (terminal)'}.
                  {nextStatus === 'resolved' &&
                    ' Note: Marking resolved requires closure verification & after-resolution evidence in backend.'}
                </small>
              </div>

              {/* Team Assignment Field */}
              <div className="cfadmin-form-field">
                <label htmlFor="cfadmin-team">Assign responsible field team</label>
                <select
                  id="cfadmin-team"
                  value={nextTeam}
                  onChange={(e) => setNextTeam(e.target.value)}
                >
                  <option value="">Leave unassigned / do not change</option>
                  <optgroup
                    label={`Recommended teams (${selectedIncident.department || 'Matching'})`}
                  >
                    {teams
                      .filter(
                        (t) =>
                          !selectedIncident.department ||
                          t.department === selectedIncident.department ||
                          t.department === 'Other / Needs Review'
                      )
                      .map((team) => (
                        <option key={String(team.id)} value={String(team.id)}>
                          {team.name} ({team.department || 'General'}
                          {team.base_sector ? ` · ${team.base_sector}` : ''})
                        </option>
                      ))}
                  </optgroup>
                  {teams.some(
                    (t) =>
                      selectedIncident.department &&
                      t.department !== selectedIncident.department &&
                      t.department !== 'Other / Needs Review'
                  ) && (
                    <optgroup label="Other municipal departments">
                      {teams
                        .filter(
                          (t) =>
                            selectedIncident.department &&
                            t.department !== selectedIncident.department &&
                            t.department !== 'Other / Needs Review'
                        )
                        .map((team) => (
                          <option key={String(team.id)} value={String(team.id)}>
                            {team.name} ({team.department})
                          </option>
                        ))}
                    </optgroup>
                  )}
                </select>
                {teams.length === 0 && (
                  <small>No teams loaded. Verify that GET /teams is reachable.</small>
                )}
              </div>

              {/* Review / Transition Note */}
              <div className="cfadmin-form-field">
                <label htmlFor="cfadmin-note">Audit note / rationale (optional)</label>
                <textarea
                  id="cfadmin-note"
                  rows={2}
                  value={reviewNote}
                  onChange={(e) => setReviewNote(e.target.value)}
                  placeholder="Explain status change or team assignment reason for the timeline audit log…"
                />
              </div>

              {notice && (
                <div className={`cfadmin-notice ${notice.type}`} style={{ marginTop: '14px' }}>
                  {notice.message}
                </div>
              )}
            </div>

            <footer className="cfadmin-review-footer">
              <button
                className="cfadmin-button cfadmin-button-secondary"
                onClick={() => setSelectedIncident(null)}
              >
                Cancel
              </button>
              {normalizedStatus(selectedIncident.status) !== 'resolved' &&
                normalizedStatus(selectedIncident.status) !== 'closed' && (
                  <button
                    className="cfadmin-button cfadmin-button-success"
                    onClick={() => openResolveModal(selectedIncident)}
                    title="Mark this complaint as resolved"
                  >
                    <CheckCircle2 size={16} /> Mark as Resolved
                  </button>
                )}
              <button
                className="cfadmin-button cfadmin-button-primary"
                onClick={() => void saveReview()}
                disabled={saving}
              >
                {saving ? (
                  <RefreshCw size={16} className="cfadmin-spin" />
                ) : (
                  <CheckCircle2 size={16} />
                )}
                {saving ? 'Saving changes…' : 'Save changes'}
              </button>
            </footer>
          </section>
        </div>
      )}

      {/* Dedicated Resolve Complaint Modal */}
      {resolvingIncident && (
        <div
          className="cfadmin-modal-backdrop"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setResolvingIncident(null);
          }}
        >
          <section
            className="cfadmin-resolve-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="cfadmin-resolve-title"
          >
            <header className="cfadmin-resolve-modal-head">
              <h3 id="cfadmin-resolve-title">
                <CheckCircle2 size={20} color="#059669" />
                Resolve Complaint · {incidentCode(resolvingIncident)}
              </h3>
              <button
                className="cfadmin-icon-button"
                onClick={() => setResolvingIncident(null)}
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </header>

            <div className="cfadmin-resolve-modal-body">
              <p style={{ margin: '0 0 16px', color: '#475569', fontSize: '12px', lineHeight: '1.5' }}>
                You are marking <strong>{textValue(resolvingIncident.title, 'this complaint')}</strong> ({incidentLocation(resolvingIncident)}) as officially <strong>RESOLVED</strong>.
              </p>

              <div className="cfadmin-form-field">
                <label htmlFor="res-notes">Resolution Notes / Action Taken</label>
                <textarea
                  id="res-notes"
                  rows={3}
                  value={resolutionNotes}
                  onChange={(e) => setResolutionNotes(e.target.value)}
                  placeholder="Describe the remedial action taken (e.g. Work completed on site by municipal crew)…"
                  required
                />
              </div>

              <div className="cfadmin-form-field">
                <label htmlFor="res-photo">Completion Photo / Evidence (Optional)</label>
                <input
                  id="res-photo"
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      setResolutionPhoto(e.target.files[0]);
                    }
                  }}
                  style={{
                    padding: '8px',
                    border: '1px dashed #cbd5e1',
                    borderRadius: '8px',
                    background: '#f8fafc',
                    fontSize: '11px',
                    width: '100%',
                  }}
                />
                <small style={{ color: '#64748b' }}>
                  {resolutionPhoto
                    ? `Selected: ${resolutionPhoto.name} (${(resolutionPhoto.size / 1024).toFixed(0)} KB)`
                    : 'If no photo is selected, an official administrative verification certificate will be automatically generated and attached.'}
                </small>
              </div>

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '10px 12px',
                  background: '#f0fdf4',
                  borderRadius: '8px',
                  border: '1px solid #bbf7d0',
                  marginTop: '12px',
                }}
              >
                <ShieldCheck size={16} color="#059669" />
                <span style={{ color: '#166534', fontSize: '11px', fontWeight: 600 }}>
                  Administrative closure certification verified on behalf of Municipal Operations.
                </span>
              </div>
            </div>

            <footer className="cfadmin-resolve-modal-foot">
              <button
                className="cfadmin-button cfadmin-button-secondary"
                onClick={() => setResolvingIncident(null)}
                disabled={resolvingSaving}
              >
                Cancel
              </button>
              <button
                className="cfadmin-button cfadmin-button-success"
                onClick={() => void handleExecuteResolve()}
                disabled={resolvingSaving}
              >
                {resolvingSaving ? (
                  <RefreshCw size={16} className="cfadmin-spin" />
                ) : (
                  <CheckCircle2 size={16} />
                )}
                {resolvingSaving ? 'Resolving complaint…' : 'Confirm & Mark Resolved'}
              </button>
            </footer>
          </section>
        </div>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
  icon,
  tone,
  trend,
  highlight,
}: {
  label: string;
  value: string;
  sub: string;
  icon: React.ReactNode;
  tone: string;
  trend?: string;
  highlight?: boolean;
}) {
  return (
    <article className={`cfadmin-stat-card ${tone} ${highlight ? 'has-alert' : ''}`}>
      <div className="cfadmin-stat-card-top">
        <span>{label}</span>
        <span className="cfadmin-stat-icon">{icon}</span>
      </div>
      <div className="cfadmin-stat-value">{value}</div>
      <div className="cfadmin-stat-card-bottom">
        <span>{sub}</span>
        {trend && (
          <span className="cfadmin-stat-trend">
            <ArrowDownRight size={13} />
            {trend}
          </span>
        )}
      </div>
    </article>
  );
}

function SeverityBadge({ severity }: { severity: string }) {
  const norm = normalizedSeverity(severity);
  return (
    <span className={`cfadmin-severity-badge ${norm}`}>
      <i />
      {norm.charAt(0).toUpperCase() + norm.slice(1)}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const norm = normalizedStatus(status);
  const label = statusLabel(norm);
  const cssClass = norm.replace(/_/g, '-');
  return (
    <span className={`cfadmin-status-badge ${cssClass}`}>
      <i />
      {label}
    </span>
  );
}

function StatusMeter({
  label,
  value,
  total,
  color,
}: {
  label: string;
  value: number;
  total: number;
  color: string;
}) {
  return (
    <div className="cfadmin-status-meter">
      <div>
        <span>
          <i className={color} />
          {label}
        </span>
        <strong>{value}</strong>
      </div>
      <div className="cfadmin-progress-track">
        <span
          className={color}
          style={{ width: `${total ? (value / total) * 100 : 0}%` }}
        />
      </div>
    </div>
  );
}

function EmptyState({ loading, text }: { loading: boolean; text: string }) {
  return (
    <div className="cfadmin-empty-state">
      {loading ? (
        <RefreshCw size={19} className="cfadmin-spin" />
      ) : (
        <MoreHorizontal size={20} />
      )}
      <span>{loading ? 'Loading live data…' : text}</span>
    </div>
  );
}
