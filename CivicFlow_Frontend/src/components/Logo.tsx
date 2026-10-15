import { ArrowUpRight, Leaf, MapPinned } from 'lucide-react';
import { Link } from 'react-router-dom';

export function Logo({ light = false, compact = false }: { light?: boolean; compact?: boolean }) {
  return (
    <Link className={`brand ${light ? 'brand-light' : ''} ${compact ? 'brand-compact' : ''}`} to={sessionStorage.getItem('civicflow_access_token') ? '/app' : '/'} aria-label="CivicFlow home">
      <span className="brand-symbol"><MapPinned size={20} strokeWidth={2.25} /><Leaf className="brand-leaf" size={10} /></span>
      <span className="brand-word">Civic<span>Flow</span></span>
    </Link>
  );
}

export function Wordmark() {
  return <span className="eyebrow-mark"><ArrowUpRight size={12} /> Built around your community</span>;
}
