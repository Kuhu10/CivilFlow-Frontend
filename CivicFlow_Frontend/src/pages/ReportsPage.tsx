import { useMemo, useState } from 'react';
import { ArrowDownWideNarrow, ArrowRight, FilePlus2, Search, SlidersHorizontal, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useIncidents } from '../api/hooks';
import { IncidentCard } from '../components/IncidentCard';
import { Alert, EmptyState, Loading } from '../components/Feedback';
import type { IncidentStatus } from '../api/types';

const FILTERS: Array<{ label: string; value: 'all' | IncidentStatus }> = [
  { label: 'All reports', value: 'all' }, { label: 'Open', value: 'open' }, { label: 'Assigned', value: 'assigned' },
  { label: 'In progress', value: 'in_progress' }, { label: 'Resolved', value: 'resolved' },
];

export function ReportsPage() {
  const { incidents, loading, error, refresh } = useIncidents();
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<'all' | IncidentStatus>('all');
  const [sort, setSort] = useState<'newest' | 'priority'>('newest');
  const filtered = useMemo(() => incidents.filter(item => {
    const text = `${item.title} ${item.description} ${item.sector} ${item.category} ${item.incident_code}`.toLowerCase();
    return (!query || text.includes(query.toLowerCase())) && (status === 'all' || item.status === status);
  }).sort((a, b) => sort === 'newest' ? Date.parse(b.created_at) - Date.parse(a.created_at) : b.priority_score - a.priority_score), [incidents, query, status, sort]);

  return <div className="page-view">
    <div className="page-heading-row"><div><div className="eyebrow">YOUR CIVICFLOW SPACE</div><h1>My reports</h1><p>Every report you’ve submitted, in one clear place.</p></div><Link className="button button-primary" to="/app/report"><FilePlus2 size={16} /> Report an issue</Link></div>
    {error && <Alert kind="error">{error} <button className="inline-action" onClick={() => void refresh()}>Retry</button></Alert>}
    <section className="surface-card reports-toolbar"><div className="reports-search"><Search size={18} /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search by title, issue, sector or reference…" aria-label="Search reports" />{query && <button className="icon-button" onClick={() => setQuery('')} aria-label="Clear search"><X size={15} /></button>}</div><label className="sort-select"><ArrowDownWideNarrow size={16} /><select value={sort} onChange={e => setSort(e.target.value as 'newest' | 'priority')} aria-label="Sort reports"><option value="newest">Newest first</option><option value="priority">Priority first</option></select></label></section>
    <div className="filter-tabs" role="tablist" aria-label="Filter reports by status">{FILTERS.map(filter => <button key={filter.value} className={status === filter.value ? 'filter-tab active' : 'filter-tab'} onClick={() => setStatus(filter.value)} role="tab" aria-selected={status === filter.value}>{filter.label}<span>{filter.value === 'all' ? incidents.length : incidents.filter(i => i.status === filter.value).length}</span></button>)}</div>
    <div className="reports-result-label"><span>{loading ? 'Fetching your reports…' : `${filtered.length} report${filtered.length === 1 ? '' : 's'} found`}</span><span><SlidersHorizontal size={14} /> Your account only</span></div>
    {loading ? <Loading label="Loading your reports…" /> : filtered.length ? <div className="reports-grid">{filtered.map(item => <IncidentCard key={item.id} incident={item} />)}</div> : <div className="surface-card reports-empty"><EmptyState icon={<FilePlus2 size={23} />} title={query || status !== 'all' ? 'No reports match those filters' : 'Nothing reported yet'} message={query || status !== 'all' ? 'Try another search or clear the current filters.' : 'When you submit a civic issue, you’ll be able to follow it here.'} action={query || status !== 'all' ? <button className="button button-outline" onClick={() => { setQuery(''); setStatus('all'); }}>Clear filters</button> : <Link to="/app/report" className="button button-primary">Create your first report <ArrowRight size={15} /></Link>} /></div>}
    <div className="prototype-note"><SlidersHorizontal size={15} /> Reports displayed here are the records returned for your signed-in account by the CivicFlow API.</div>
  </div>;
}
