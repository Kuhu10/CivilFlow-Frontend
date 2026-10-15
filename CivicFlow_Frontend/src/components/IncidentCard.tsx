import { ArrowUpRight, Clock3, MapPin, ShieldAlert, Wrench } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { Incident } from '../api/types';
import { SeverityBadge, StatusBadge } from './StatusBadge';

function relativeDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return 'Recently reported';
  const hours = Math.max(0, Math.floor((Date.now() - date.getTime()) / 3600000));
  if (hours < 1) return 'Just reported';
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? 'Yesterday' : `${days} days ago`;
}

const categoryIcon: Record<string, string> = {
  'Road Damage': 'road', 'Waste Overflow': 'waste', 'Streetlight Outage': 'light',
  'Drainage Issue': 'drain', 'Water Supply': 'water', 'Park Maintenance': 'park', 'Public Safety': 'safety',
};

export function IncidentCard({ incident, compact = false }: { incident: Incident; compact?: boolean }) {
  const type = categoryIcon[incident.category] || 'other';
  return (
    <Link to={`/app/incidents/${incident.id}`} className={`incident-card ${compact ? 'incident-card-compact' : ''}`}>
      <div className={`incident-icon issue-${type}`}>{type === 'safety' ? <ShieldAlert size={19} /> : <Wrench size={19} />}</div>
      <div className="incident-main">
        <div className="incident-idline"><span>{incident.incident_code}</span>{incident.safety_risk && <span className="safety-flag"><ShieldAlert size={12} /> Safety flag</span>}</div>
        <h3>{incident.title || incident.category}</h3>
        {!compact && <p>{incident.summary || incident.description}</p>}
        <div className="incident-meta"><span><MapPin size={13} />{incident.sector}</span><span><Clock3 size={13} />{relativeDate(incident.created_at)}</span></div>
        <div className="incident-badges"><StatusBadge status={incident.status} /><SeverityBadge severity={incident.severity} /></div>
      </div>
      <span className="incident-go" aria-hidden="true"><ArrowUpRight size={17} /></span>
    </Link>
  );
}
