import { useMemo, useState } from 'react';
import { ArrowRight, MapPin, Search, SlidersHorizontal } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useIncidents } from '../api/hooks';
import { CityMap } from '../components/CityMap';
import { Alert, Loading } from '../components/Feedback';
import type { Incident } from '../api/types';
import { SeverityBadge, StatusBadge } from '../components/StatusBadge';

const inChandigarh = (item: Incident) => item.latitude != null && item.longitude != null && item.latitude >= 30.60 && item.latitude <= 30.88 && item.longitude >= 76.63 && item.longitude <= 76.94;

export function MapPage() {
  const { incidents, loading, error, refresh } = useIncidents();
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string>();
  const filtered = useMemo(() => incidents.filter(item => !query || `${item.title} ${item.category} ${item.sector} ${item.incident_code}`.toLowerCase().includes(query.toLowerCase())), [incidents, query]);
  const selected = filtered.find(i => i.id === selectedId);
  const mapped = filtered.filter(inChandigarh);
  const withoutCoordinates = filtered.filter(i => i.latitude == null || i.longitude == null);
  return <div className="page-view map-page">
    <div className="page-heading-row"><div><div className="eyebrow">LOCATION EXPLORER</div><h1>Incident map</h1><p>See reports with saved coordinates around Chandigarh.</p></div><Link to="/app/report" className="button button-primary"><MapPin size={16} /> Report a location</Link></div>
    {error && <Alert kind="error">{error} <button className="inline-action" onClick={() => void refresh()}>Retry</button></Alert>}
    <div className="map-page-stats"><div><b>{incidents.length}</b><span>Total reports</span></div><div><b>{mapped.length}</b><span>Mapped in Chandigarh view</span></div><div><b>{withoutCoordinates.length}</b><span>Without coordinates</span></div></div>
    <div className="map-workspace"><section className="surface-card map-large-panel"><div className="map-large-head"><div><h2>Chandigarh & nearby sectors</h2><p>Choose a pin to open its report details.</p></div><span className="map-open-label"><i /> Interactive map</span></div>{loading ? <Loading label="Loading map data…" /> : <CityMap incidents={filtered} selectedId={selectedId} onSelect={item => setSelectedId(item.id)} height="min(65vh, 640px)" />}<div className="map-truth-note">Pins appear only for saved coordinates within the Chandigarh view. No approximate pin is invented for reports without location data.</div></section>
      <aside className="surface-card map-case-panel"><div className="map-case-head"><div><div className="eyebrow">REPORT DIRECTORY</div><h2>Location records</h2></div><span className="count-pill">{filtered.length}</span></div><div className="map-search"><Search size={16} /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Find a report…" /></div>{selected && <div className="map-selected-card"><span>{selected.incident_code}</span><b>{selected.title || selected.category}</b><p>{selected.sector}</p><div><StatusBadge status={selected.status} /><SeverityBadge severity={selected.severity} /></div><Link to={`/app/incidents/${selected.id}`} className="button button-primary button-full button-small">Open details <ArrowRight size={14} /></Link></div>}<div className="map-case-list">{filtered.map(item => <button key={item.id} className={`map-case-row ${selectedId === item.id ? 'selected' : ''}`} onClick={() => setSelectedId(item.id)}><span className={`case-marker case-marker-${item.severity}`}><MapPin size={15} /></span><span className="map-case-copy"><b>{item.title || item.category}</b><small>{item.sector} · {item.incident_code}</small></span><span className={`map-case-status ${inChandigarh(item) ? 'has-coordinate' : ''}`} title={inChandigarh(item) ? 'Mapped in Chandigarh view' : 'No coordinates in Chandigarh view'}>{inChandigarh(item) ? 'Mapped' : 'List'}</span></button>)}{!filtered.length && <p className="muted-copy">No reports match your search.</p>}</div><div className="map-directory-footer"><SlidersHorizontal size={14} /> {withoutCoordinates.length} report(s) don't include coordinates.</div></aside></div>
  </div>;
}
