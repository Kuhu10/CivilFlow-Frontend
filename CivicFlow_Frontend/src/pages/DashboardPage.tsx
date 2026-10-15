import { useMemo, useState, type ReactNode } from 'react';
import { ArrowRight, ArrowUpRight, CheckCircle2, Clock3, FilePlus2, MapPin, ShieldAlert, Sparkles } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { useIncidents } from '../api/hooks';
import { IncidentCard } from '../components/IncidentCard';
import { Alert, EmptyState, Loading } from '../components/Feedback';
import { CityMap } from '../components/CityMap';
import { VideoBackground } from '../components/VideoBackground';

function Metric({ label, value, hint, type, icon }: { label: string; value: number; hint: string; type: string; icon: ReactNode }) {
  return <div className="metric-tile"><div className={`metric-icon metric-icon-${type}`}>{icon}</div><div className="metric-data"><span>{label}</span><strong>{value}</strong><small>{hint}</small></div><span className={`metric-edge metric-edge-${type}`} /></div>;
}

export function DashboardPage() {
  const { user } = useAuth();
  const { incidents, loading, error, refresh } = useIncidents();
  const navigate = useNavigate();
  const [selectedId, setSelectedId] = useState<string | undefined>();
  const active = useMemo(() => incidents.filter(i => ['open', 'assigned', 'in_progress'].includes(i.status)), [incidents]);
  const inProgress = incidents.filter(i => i.status === 'in_progress' || i.status === 'assigned').length;
  const resolved = incidents.filter(i => i.status === 'resolved' || i.status === 'closed').length;
  const selectedIncident = incidents.find(i => i.id === selectedId);
  const recent = [...incidents].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at)).slice(0, 4);

  return <div className="page-view dashboard-view">
    <div className="page-welcome-row"><div><div className="eyebrow">YOUR CIVICFLOW SPACE</div><h1>Good to see you, {user?.full_name?.split(' ')[0] || 'there'}<span className="wave">✳</span></h1><p>Here’s what’s happening with the reports you’ve raised.</p></div><div className="welcome-date"><span>YOUR COMMUNITY</span><b>Chandigarh</b><span className="welcome-date-dot"><i /> Workspace active</span></div></div>
    {error && <Alert kind="error">{error} <button className="inline-action" onClick={() => void refresh()}>Try again</button></Alert>}
    <section className="dashboard-video-banner"><VideoBackground src="/videos/technology-grid.mp4" className="dashboard-banner-video" poster="/images/technology-grid.jpg" /><div className="dashboard-banner-content"><span className="banner-pill"><Sparkles size={13} /> Community, connected</span><h2>Every report can be<br />a step toward better.</h2><p>Share what needs attention. Keep track of what happens next.</p><Link className="button button-bright" to="/app/report">Report an issue <ArrowRight size={16} /></Link></div><div className="banner-floating-note"><span className="floating-icon"><MapPin size={16} /></span><div><b>Your voice, in the workflow.</b><small>Details help teams understand the issue.</small></div></div></section>

    <section className="metric-grid" aria-label="Report summary">
      <Metric label="Total reports" value={incidents.length} hint="Submitted by you" type="blue" icon={<FilePlus2 size={19} />} />
      <Metric label="In progress" value={inProgress} hint="Assigned or underway" type="amber" icon={<Clock3 size={19} />} />
      <Metric label="Resolved" value={resolved} hint="Marked complete" type="green" icon={<CheckCircle2 size={19} />} />
      <Metric label="Need attention" value={active.filter(i => i.safety_risk).length} hint="Safety flag on active reports" type="red" icon={<ShieldAlert size={19} />} />
    </section>

    <div className="dashboard-columns">
      <section className="surface-card map-panel"><div className="section-card-head"><div><div className="eyebrow">LOCATION VIEW</div><h2>Reports around the city</h2><p>Only reports with saved coordinates appear as pins.</p></div><Link className="icon-link" to="/app/map" aria-label="Open full map"><ArrowUpRight size={18} /></Link></div><CityMap incidents={incidents} selectedId={selectedId} onSelect={item => { setSelectedId(item.id); }} height="330px" />{selectedIncident && <div className="map-selected"><div><small>{selectedIncident.incident_code}</small><b>{selectedIncident.title || selectedIncident.category}</b><span>{selectedIncident.sector}</span></div><Link to={`/app/incidents/${selectedIncident.id}`} className="button button-outline button-small">View report <ArrowRight size={14} /></Link></div>}<div className="map-panel-foot"><span><i className="legend-dot legend-critical" /> Critical</span><span><i className="legend-dot legend-high" /> High</span><span><i className="legend-dot legend-medium" /> Medium</span><span><i className="legend-dot legend-low" /> Low</span><Link to="/app/map">Explore map <ArrowRight size={14} /></Link></div></section>

      <section className="surface-card recent-panel"><div className="section-card-head"><div><div className="eyebrow">YOUR ACTIVITY</div><h2>Recent reports</h2><p>Keep an eye on your latest submissions.</p></div><Link to="/app/reports" className="text-link">View all <ArrowRight size={14} /></Link></div>{loading ? <Loading label="Loading reports…" /> : recent.length ? <div className="recent-list">{recent.map(item => <IncidentCard key={item.id} incident={item} compact />)}</div> : <EmptyState icon={<FilePlus2 size={22} />} title="Your first report starts here" message="Share a civic issue in your neighborhood to see updates here." action={<Link to="/app/report" className="button button-primary">Create a report <ArrowRight size={15} /></Link>} />}<div className="recent-panel-foot"><div className="mini-spark"><Sparkles size={15} /></div><p><b>Helpful details go a long way.</b><br />A clear description and sector make a report easier to understand.</p><button className="icon-button" onClick={() => navigate('/app/report')} aria-label="Create a report"><ArrowUpRight size={17} /></button></div></section>
    </div>

    <section className="how-strip"><div className="how-strip-title"><span className="eyebrow">WHAT HAPPENS NEXT</span><h2>Clear from the first step.</h2></div><div className="how-step"><span>01</span><div><b>Report</b><p>Describe the issue and location.</p></div></div><div className="how-step"><span>02</span><div><b>Review</b><p>AI suggestions are checked by people.</p></div></div><div className="how-step"><span>03</span><div><b>Track</b><p>Come back to see the status.</p></div></div></section>
    <div className="prototype-note"><ShieldAlert size={15} /> CivicFlow is a prototype. Reports submitted here are stored in the connected demo backend and are not sent to an official government department or emergency service.</div>
  </div>;
}
