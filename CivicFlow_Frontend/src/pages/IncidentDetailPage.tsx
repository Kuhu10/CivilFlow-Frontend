import { useCallback, useEffect, useState, type ChangeEvent } from 'react';
import { ArrowLeft, Clock3, Download, FileImage, FilePlus2, MapPin, RefreshCw, ShieldAlert, ShieldCheck, UploadCloud } from 'lucide-react';
import { Link, useParams, useLocation } from 'react-router-dom';
import { api, ApiError } from '../api/client';
import type { AuditEvent, Evidence, Incident } from '../api/types';
import { Alert, EmptyState, Loading } from '../components/Feedback';
import { SeverityBadge, StatusBadge } from '../components/StatusBadge';

function dateTime(value?: string | null) {
  if (!value) return 'Not available';
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? 'Not available' : new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}
function prettyAction(value: string) { return value.replaceAll('.', ' ').replaceAll('_', ' ').replace(/\b\w/g, letter => letter.toUpperCase()); }

export function IncidentDetailPage() {
  const { id = '' } = useParams();
  const location = useLocation();
  const [incident, setIncident] = useState<Incident | null>(null);
  const [evidence, setEvidence] = useState<Evidence[]>([]);
  const [timeline, setTimeline] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [photo, setPhoto] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [notice, setNotice] = useState('');
  const created = Boolean((location.state as { created?: boolean } | null)?.created || new URLSearchParams(location.search).get('created') === '1');
  const duplicateNotice = sessionStorage.getItem('civicflow_duplicate_notice');
  const pendingUploadWarning = sessionStorage.getItem('civicflow_pending_upload_warning');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [record, files, events] = await Promise.all([
        api.getIncident(id), api.listEvidence(id).catch(() => [] as Evidence[]), api.timeline(id).catch(() => [] as AuditEvent[]),
      ]);
      setIncident(record); setEvidence(files); setTimeline(events);
    } catch (err) { setError((err as ApiError).message || 'Could not load this report.'); }
    finally { setLoading(false); }
  }, [id]);
  useEffect(() => { void load(); }, [load]);

  const upload = async () => {
    if (!photo) return;
    setUploading(true); setError(''); setNotice('');
    try { await api.uploadEvidence(id, photo, 'other', 'Additional evidence submitted from report details.'); setPhoto(null); setNotice('Evidence uploaded successfully.'); await load(); }
    catch (err) { setError((err as ApiError).message || 'Evidence upload failed.'); }
    finally { setUploading(false); }
  };
  const choosePhoto = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] || null;
    if (file && !['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) { setError('Choose a JPEG, PNG or WebP image.'); return; }
    if (file && file.size > 10 * 1024 * 1024) { setError('The image must be 10 MB or smaller.'); return; }
    setPhoto(file); setError('');
  };

  if (loading) return <div className="page-view"><Loading label="Loading report details…" /></div>;
  if (error && !incident) return <div className="page-view"><Alert kind="error">{error}</Alert><Link className="button button-outline" to="/app/reports"><ArrowLeft size={15} /> Back to reports</Link></div>;
  if (!incident) return null;
  const orderTimeline = [...timeline].sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
  const duplicates = (() => { try { const parsed = duplicateNotice ? JSON.parse(duplicateNotice) as { incidentId: string; candidates: Array<{ incident_code: string; title: string; reason: string }> } : null; return parsed?.incidentId === incident.id ? parsed.candidates : []; } catch { return []; } })();

  return <div className="page-view detail-page">
    <div className="detail-backrow"><Link to="/app/reports" className="back-link"><ArrowLeft size={15} /> My reports</Link><span className="detail-ref">Reference <b>{incident.incident_code}</b></span></div>
    {created && <Alert kind="success">Your report was submitted successfully. Keep the reference number for follow-up.</Alert>}
    {pendingUploadWarning && <Alert kind="warning" onClose={() => sessionStorage.removeItem('civicflow_pending_upload_warning')}>{pendingUploadWarning}</Alert>}
    {duplicates.length > 0 && <Alert kind="warning" onClose={() => sessionStorage.removeItem('civicflow_duplicate_notice')}><b>Possible related reports were found.</b><p className="alert-detail-copy">A human should review possible duplicates. No report has been merged automatically.</p>{duplicates.map(item => <div className="duplicate-row" key={item.incident_code}><b>{item.incident_code}</b> · {item.title}<small>{item.reason}</small></div>)}</Alert>}
    {error && <Alert kind="error" onClose={() => setError('')}>{error}</Alert>}{notice && <Alert kind="success" onClose={() => setNotice('')}>{notice}</Alert>}
    <div className="detail-title-row"><div><div className="eyebrow">INCIDENT DETAILS</div><h1>{incident.title || incident.category}</h1><p>{incident.summary || incident.description}</p><div className="incident-badges detail-badges"><StatusBadge status={incident.status} /><SeverityBadge severity={incident.severity} />{incident.safety_risk && <span className="safety-chip"><ShieldAlert size={13} /> Safety flag</span>}</div></div><button className="button button-outline" onClick={() => void load()}><RefreshCw size={15} /> Refresh</button></div>
    <div className="detail-grid">
      <div className="detail-main-col">
        <section className="surface-card detail-section"><div className="section-card-head"><div><div className="eyebrow">THE REPORT</div><h2>What was reported</h2></div><span className="detail-type-icon"><FilePlus2 size={20} /></span></div><p className="detail-description">{incident.description}</p><div className="detail-attribute-grid"><div><span>Category</span><b>{incident.category}</b></div><div><span>Department</span><b>{incident.department}</b></div><div><span>Sector / area</span><b><MapPin size={14} /> {incident.sector}</b></div><div><span>Submitted</span><b><Clock3 size={14} /> {dateTime(incident.created_at)}</b></div><div><span>Estimated people affected</span><b>{incident.affected_count}</b></div><div><span>Priority score</span><b>{incident.priority_score}/100</b></div></div>{incident.location_description && <div className="detail-location-note"><MapPin size={15} /><span>{incident.location_description}</span></div>}</section>
        <section className="surface-card detail-section"><div className="section-card-head"><div><div className="eyebrow">PHOTO & DOCUMENTATION</div><h2>Evidence</h2><p>Photos help keep useful context attached to your report.</p></div><span className="count-pill">{evidence.length}</span></div>{evidence.length ? <div className="evidence-list">{evidence.map(item => <div className="evidence-item" key={item.id}><span className="evidence-thumbnail"><FileImage size={20} /></span><div className="evidence-info"><b>{item.original_filename}</b><span>{item.kind} · {(item.size_bytes / 1024).toFixed(0)} KB · {dateTime(item.created_at)}</span>{item.note && <small>{item.note}</small>}</div><button className="icon-button" title="Download evidence" onClick={() => void api.downloadEvidence(incident.id, item.id, item.original_filename).catch(err => setError((err as Error).message))}><Download size={17} /></button></div>)}</div> : <EmptyState icon={<FileImage size={22} />} title="No photos attached" message="You can add an optional photo if it adds useful context." />}
          <div className="evidence-upload-row"><label className="evidence-file-picker"><UploadCloud size={16} /><span>{photo ? photo.name : 'Choose an image to add'}</span><input type="file" accept="image/jpeg,image/png,image/webp" onChange={choosePhoto} /></label><button className="button button-primary button-small" disabled={!photo || uploading} onClick={() => void upload()}>{uploading ? 'Uploading…' : 'Upload evidence'} <ArrowRightMini /></button></div><small className="evidence-note">JPEG, PNG or WebP, up to 10 MB. Evidence is stored privately in the connected prototype backend.</small>
        </section>
      </div>
      <aside className="detail-side-col">
        <section className="surface-card detail-side-card"><div className="eyebrow">CURRENT STATUS</div><div className="status-large"><StatusBadge status={incident.status} /></div><h3>{incident.status === 'open' ? 'Your report is in the queue.' : incident.status === 'assigned' ? 'A team has been assigned.' : incident.status === 'in_progress' ? 'Work is marked in progress.' : incident.status === 'resolved' ? 'Marked as resolved.' : incident.status === 'closed' ? 'This report is closed.' : 'Linked as a possible duplicate.'}</h3><p>{incident.status === 'open' ? 'The report has been created in CivicFlow. This prototype does not guarantee an official response.' : incident.status === 'resolved' || incident.status === 'closed' ? 'A resolution status was recorded in the connected backend.' : 'Check back here for the latest status recorded in CivicFlow.'}</p><div className="status-last-updated"><Clock3 size={14} /> Updated {dateTime(incident.updated_at)}</div></section>
        <section className="surface-card detail-side-card"><div className="eyebrow">AI-ASSISTED TRIAGE</div><div className="triage-summary-icon"><ShieldCheck size={19} /></div><h3>{incident.recommended_action || 'Review and assign this report.'}</h3><p>{incident.ai_rationale || 'No triage rationale was saved for this report.'}</p><div className="provider-label">Analysis source <b>{incident.ai_provider}</b></div><div className="human-review-note">AI is advisory. This page does not perform municipal dispatch or emergency escalation.</div></section>
        <section className="surface-card detail-side-card timeline-card"><div className="section-card-head"><div><div className="eyebrow">ACTIVITY</div><h2>Report timeline</h2></div><Clock3 size={18} /></div>{orderTimeline.length ? <div className="timeline-list">{orderTimeline.map(event => <div className="timeline-event" key={event.id}><span className="timeline-node"><span /></span><div><b>{prettyAction(event.action)}</b><small>{dateTime(event.created_at)}</small>{event.new_values && <p>{Object.entries(event.new_values).filter(([key]) => ['status', 'note', 'closure_verified'].includes(key)).map(([key, value]) => `${prettyAction(key)}: ${String(value)}`).join(' · ')}</p>}</div></div>)}</div> : <p className="muted-copy">No additional activity has been recorded yet.</p>}</section>
      </aside>
    </div>
  </div>;
}
function ArrowRightMini() { return <span aria-hidden="true">→</span>; }
