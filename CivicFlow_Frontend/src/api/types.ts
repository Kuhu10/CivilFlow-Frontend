export type UserRole = 'citizen' | 'officer' | 'admin' | 'superadmin';

export interface User {
  id: string;
  full_name: string;
  email: string;
  role: UserRole;
  department: string | null;
  is_active: boolean;
  created_at: string;
}

export type IncidentStatus = 'open' | 'assigned' | 'in_progress' | 'resolved' | 'closed' | 'duplicate';
export type Severity = 'low' | 'medium' | 'high' | 'critical';

export interface Incident {
  id: string;
  incident_code: string;
  title: string;
  description: string;
  summary: string;
  category: string;
  department: string;
  severity: Severity;
  status: IncidentStatus;
  priority_score: number;
  safety_risk: boolean;
  affected_count: number;
  sector: string;
  location_description: string | null;
  latitude: number | null;
  longitude: number | null;
  source: string;
  ai_provider: string;
  ai_rationale: string;
  recommended_action: string;
  tags: string[];
  created_by_id: string;
  assigned_team_id: string | null;
  assigned_to_id: string | null;
  closure_verified: boolean;
  resolution_notes: string | null;
  resolved_at: string | null;
  merged_into_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface IncidentAnalysis {
  suggested_title: string;
  summary: string;
  category: string;
  department: string;
  severity: Severity;
  safety_risk: boolean;
  recommended_action: string;
  rationale: string;
  tags: string[];
  provider: string;
  warnings: string[];
}

export interface Evidence {
  id: string;
  incident_id: string;
  uploaded_by_id: string;
  kind: 'before' | 'after' | 'other';
  original_filename: string;
  mime_type: string;
  size_bytes: number;
  checksum_sha256: string;
  note: string | null;
  created_at: string;
  download_path?: string;
}

export interface AuditEvent {
  id: string;
  actor_id: string | null;
  action: string;
  old_values?: Record<string, unknown> | null;
  new_values?: Record<string, unknown> | null;
  request_id?: string | null;
  created_at: string;
}

export interface Envelope<T> {
  data: T;
  meta: { request_id?: string; pagination?: { page: number; page_size: number; total: number; pages: number } };
}

export const CATEGORIES = [
  'Road Damage', 'Waste Overflow', 'Streetlight Outage', 'Drainage Issue',
  'Water Supply', 'Park Maintenance', 'Public Safety', 'Other / Needs Review',
] as const;

export const DEPARTMENT_BY_CATEGORY: Record<string, string> = {
  'Road Damage': 'Roads & Infrastructure',
  'Waste Overflow': 'Waste Management',
  'Streetlight Outage': 'Street Lighting',
  'Drainage Issue': 'Drainage',
  'Water Supply': 'Water Supply',
  'Park Maintenance': 'Parks & Public Spaces',
  'Public Safety': 'Public Safety',
  'Other / Needs Review': 'Other / Needs Review',
};

export const SECTORS = [
  'Sector 1', 'Sector 2', 'Sector 8', 'Sector 10', 'Sector 15', 'Sector 17',
  'Sector 22', 'Sector 26', 'Sector 34', 'Sector 35', 'Sector 43', 'Sector 46',
  'Sector 52', 'Manimajra', 'Industrial Area Phase 1', 'Industrial Area Phase 2', 'Other',
];
