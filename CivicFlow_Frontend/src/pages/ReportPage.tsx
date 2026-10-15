import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { ArrowLeft, ArrowRight, Check, FileImage, FilePlus2, MapPin, UploadCloud, X } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { api, ApiError } from '../api/client';
import type { Severity } from '../api/types';
import { CATEGORIES, DEPARTMENT_BY_CATEGORY, SECTORS } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { Alert } from '../components/Feedback';
import { LocationPicker, SECTOR_COORDINATES } from '../components/CityMap';

export function ReportPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const isMounted = useRef(true);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [sector, setSector] = useState('Sector 17');
  const [category, setCategory] = useState<string>('Other / Needs Review');
  const [severity, setSeverity] = useState<Severity>('medium');
  const [safetyRisk, setSafetyRisk] = useState(false);
  const [affected, setAffected] = useState('1');
  const [locationDescription, setLocationDescription] = useState('');
  const [point, setPoint] = useState<{ lat: number; lon: number } | null>(null);
  const [photo, setPhoto] = useState<File | null>(null);
  const [submitBusy, setSubmitBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const department = DEPARTMENT_BY_CATEGORY[category] || 'Other / Needs Review';

  useEffect(() => {
    isMounted.current = true;
    return () => { isMounted.current = false; };
  }, []);

  const onFile = (event: ChangeEvent<HTMLInputElement>) => {
    const chosen = event.target.files?.[0] || null;
    setError('');
    if (chosen && !['image/jpeg', 'image/png', 'image/webp'].includes(chosen.type)) { setError('Choose a JPEG, PNG or WebP image.'); event.target.value = ''; return; }
    if (chosen && chosen.size > 10 * 1024 * 1024) { setError('The image must be 10 MB or smaller.'); event.target.value = ''; return; }
    setPhoto(chosen);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault(); setError(''); setNotice('');
    if (description.trim().length < 10) { setError('Please provide at least 10 characters describing the issue.'); return; }
    setSubmitBusy(true);
    try {
      const created = await api.createIncident({
        description: description.trim(), sector,
        ...(title.trim() ? { title: title.trim() } : {}),
        category, department, severity, safety_risk: safetyRisk,
        affected_count: Number(affected),
        ...(locationDescription.trim() ? { location_description: locationDescription.trim() } : {}),
        ...(point ? { latitude: point.lat, longitude: point.lon } : {}),
      });
      if (photo) {
        try { await api.uploadEvidence(created.incident.id, photo, 'before', 'Photo attached during initial report submission.'); }
        catch (err) { sessionStorage.setItem('civicflow_pending_upload_warning', `Report was created but the photo failed to upload: ${(err as Error).message}`); }
      }
      if (created.possible_duplicates?.length) sessionStorage.setItem('civicflow_duplicate_notice', JSON.stringify({ incidentId: created.incident.id, candidates: created.possible_duplicates }));
      navigate(`/app/incidents/${created.incident.id}?created=1`, { state: { created: true, duplicateCount: created.possible_duplicates?.length || 0 } });
    } catch (err) {
      if (isMounted.current) {
        setError((err as ApiError).message || 'The report could not be submitted. Please try again.');
      }
    } finally {
      if (isMounted.current) {
        setSubmitBusy(false);
      }
    }
  };

  const handleSectorChange = (chosenSector: string) => {
    setSector(chosenSector);
    const coords = SECTOR_COORDINATES[chosenSector];
    if (coords) {
      setPoint({ lat: coords[0], lon: coords[1] });
      setLocationDescription(prev => (!prev || prev.startsWith('Near ') || prev.startsWith('Field GPS') ? `Near ${chosenSector}` : prev));
    }
  };

  return <div className="page-view report-page">
    <div className="page-heading-row report-page-heading"><div><Link to="/app" className="back-link"><ArrowLeft size={14} /> Back to overview</Link><div className="eyebrow">CITIZEN INTAKE</div><h1>Report an issue</h1><p>Tell us what needs attention. Clear details help your report get understood.</p></div><div className="report-protection"><span><Check size={15} /></span><div><b>You're signed in as {user?.full_name?.split(' ')[0]}</b><small>Your report is connected to your account.</small></div></div></div>
    {error && <Alert kind="error" onClose={() => setError('')}>{error}</Alert>}
    {notice && <Alert kind="info" onClose={() => setNotice('')}>{notice}</Alert>}
    <form className="report-form-layout" onSubmit={submit}>
      <div className="report-form-main">
        <section className="surface-card form-section"><div className="form-section-heading"><span className="step-disc">01</span><div><h2>Describe the issue</h2><p>Start with what happened and where you noticed it.</p></div></div>
          <label className="form-field"><span>Short title <small>Optional</small></span><input value={title} maxLength={180} onChange={e => setTitle(e.target.value)} placeholder="e.g. Pothole near the bus stop" /></label>
          <label className="form-field"><span>What happened? <b>*</b></span><textarea value={description} required minLength={10} maxLength={5000} onChange={e => setDescription(e.target.value)} placeholder="Describe the issue in your own words. Mention what you noticed and how it affects the area…" rows={5} /><div className="input-foot"><span>Be specific and factual. Avoid sharing personal information.</span><span>{description.length}/5000</span></div></label>
          <div className="photo-drop"><div className="photo-icon"><FileImage size={21} /></div><div className="photo-copy"><b>Add a photo</b><p>One helpful image can add context. JPEG, PNG or WebP up to 10 MB.</p>{photo && <div className="file-pill"><FileImage size={14} /><span>{photo.name}</span><button type="button" aria-label="Remove selected photo" onClick={() => setPhoto(null)}><X size={14} /></button></div>}</div><label className="button button-outline button-small photo-choose"><UploadCloud size={15} /> {photo ? 'Change photo' : 'Choose file'}<input type="file" accept="image/jpeg,image/png,image/webp" onChange={onFile} hidden /></label></div>
        </section>

        <section className="surface-card form-section"><div className="form-section-heading"><span className="step-disc">02</span><div><h2>Where is it?</h2><p>Choose the sector or tap the map. The map and sector selection stay fully synchronized.</p></div></div>
          <label className="form-field"><span>Sector / area <b>*</b></span><select value={sector} onChange={e => handleSectorChange(e.target.value)} required>{SECTORS.map(item => <option key={item}>{item}</option>)}</select></label>
          <label className="form-field"><span>Location details <small>Optional</small></span><input value={locationDescription} onChange={e => setLocationDescription(e.target.value)} maxLength={255} placeholder="Landmark, cross street, or nearby place" /></label>
          <LocationPicker
            value={point}
            onChange={setPoint}
            selectedSector={sector}
            onSectorDetected={(detectedSector) => setSector(detectedSector)}
            onLocationDescriptionSuggest={(desc) => {
              setLocationDescription(prev => (!prev || prev.startsWith('Near ') || prev.startsWith('Field GPS') ? desc : prev));
            }}
          />
          <div className="location-disclaimer"><MapPin size={15} /><span>Only the location you select is sent as coordinates. If you skip the map, no coordinates are invented.</span></div>
        </section>
      </div>

      <aside className="report-form-aside">
        <section className="surface-card form-section"><div className="form-section-heading aside-heading"><span className="step-disc">03</span><div><h2>Issue details</h2><p>Review the classification before submitting.</p></div></div>
          <label className="form-field"><span>Issue category <b>*</b></span><select value={category} onChange={e => setCategory(e.target.value)} required>{CATEGORIES.map(item => <option key={item}>{item}</option>)}</select></label>
          <div className="department-preview"><span>Suggested department</span><b>{department}</b><small>Mapped from the selected category.</small></div>
          <label className="form-field"><span>How urgent does it seem?</span><select value={severity} onChange={e => setSeverity(e.target.value as Severity)}><option value="low">Low — minor issue</option><option value="medium">Medium — needs attention</option><option value="high">High — significant concern</option><option value="critical">Critical — urgent safety concern</option></select></label>
          <label className="toggle-row"><span><b>Potential safety concern</b><small>Is there a possible risk to people?</small></span><input type="checkbox" checked={safetyRisk} onChange={e => setSafetyRisk(e.target.checked)} /><span className="toggle-track" /></label>
          <label className="form-field"><span>People affected (estimate)</span><input type="number" min={1} max={1000000} value={affected} onChange={e => setAffected(e.target.value)} required /></label>
          <div className="form-review-note"><ShieldCheckMini /><p>AI output and priority are suggestions. A person must review the report; submitting does not notify an emergency service.</p></div>
          <button className="button button-primary button-full button-large submit-report-btn" type="submit" disabled={submitBusy}>
            <span>{submitBusy ? 'Submitting report…' : 'Submit report'}</span>
            {!submitBusy && <ArrowRight size={17} />}
          </button>
          <p className="submit-consent">By submitting, you confirm the report is accurate to the best of your knowledge.</p>
        </section>
        <div className="report-help-card"><div className="help-bubble"><FilePlus2 size={18} /></div><b>A good report is specific.</b><p>Describe the issue, choose the right area, and attach a photo if it adds useful context.</p></div>
      </aside>
    </form>
  </div>;
}

function ShieldCheckMini() { return <span className="mini-shield"><Check size={13} /></span>; }
