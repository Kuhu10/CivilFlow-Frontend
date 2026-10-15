import type { IncidentStatus, Severity } from '../api/types';

const statusLabel: Record<IncidentStatus, string> = {
  open: 'Open', assigned: 'Assigned', in_progress: 'In progress', resolved: 'Resolved', closed: 'Closed', duplicate: 'Duplicate',
};
const severityLabel: Record<Severity, string> = { low: 'Low', medium: 'Medium', high: 'High', critical: 'Critical' };

export function StatusBadge({ status }: { status: IncidentStatus }) {
  return <span className={`badge status-${status}`}><span className="badge-dot" />{statusLabel[status] ?? status}</span>;
}
export function SeverityBadge({ severity }: { severity: Severity }) {
  return <span className={`badge severity-${severity}`}>{severityLabel[severity] ?? severity}</span>;
}
