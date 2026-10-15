import { useState } from 'react';
import { ChevronDown, CircleHelp, FilePlus2, LayoutDashboard, LogOut, MapPinned, Menu, ShieldCheck, X, ClipboardList, Sparkles } from 'lucide-react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { Logo } from '../components/Logo';

const links = [
  { to: '/app', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/app/report', label: 'Report an issue', icon: FilePlus2 },
  { to: '/app/reports', label: 'My reports', icon: ClipboardList },
  { to: '/app/map', label: 'Incident map', icon: MapPinned },
];

export function AppShell() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileMenu, setMobileMenu] = useState(false);
  const pageTitle = links.find(item => item.to === location.pathname)?.label || (location.pathname.includes('/incidents/') ? 'Incident details' : 'Your profile');
  const doSignOut = () => { signOut(); navigate('/'); };

  return <div className="app-shell">
    <aside className={`app-sidebar ${mobileMenu ? 'sidebar-open' : ''}`}>
      <div className="sidebar-brand-row"><Logo light /><button className="icon-button sidebar-close" onClick={() => setMobileMenu(false)} aria-label="Close navigation"><X /></button></div>
      <div className="workspace-label">YOUR WORKSPACE</div>
      <nav className="side-nav" aria-label="Main navigation">
        {links.map(({ to, label, icon: Icon, end }) => <NavLink key={to} end={end} to={to} onClick={() => setMobileMenu(false)} className={({ isActive }) => `side-nav-link ${isActive ? 'active' : ''}`}><Icon size={18} strokeWidth={1.8} /><span>{label}</span>{label === 'Report an issue' && <span className="nav-plus">+</span>}</NavLink>)}
      </nav>
      <div className="sidebar-bottom">
        <div className="sidebar-tip"><span className="tip-icon"><Sparkles size={16} /></span><b>Every report matters.</b><p>Clear details help the right team take action.</p><button onClick={() => navigate('/app/report')}>Create a report <span>↗</span></button></div>
        <div className="sidebar-user"><span className="avatar">{user?.full_name?.slice(0, 1).toUpperCase() || 'C'}</span><div className="sidebar-user-copy"><b>{user?.full_name || 'CivicFlow member'}</b><span>{user?.role || 'citizen'}</span></div><button onClick={doSignOut} className="icon-button signout-btn" aria-label="Sign out" title="Sign out"><LogOut size={17} /></button></div>
      </div>
    </aside>
    {mobileMenu && <button className="mobile-scrim" onClick={() => setMobileMenu(false)} aria-label="Close navigation overlay" />}
    <div className="app-main">
      <header className="app-topbar">
        <button className="icon-button mobile-menu-button" aria-label="Open navigation" onClick={() => setMobileMenu(true)}><Menu size={21} /></button>
        <div className="breadcrumb"><span>Workspace</span><span className="breadcrumb-sep">/</span><b>{pageTitle}</b></div>
        <div className="topbar-actions">
          <span className="service-status"><i /> Services workspace</span>
          <button className="icon-button help-button" title="Help and guidance" onClick={() => navigate('/app/profile')}><CircleHelp size={18} /></button>
          <button className="topbar-profile" onClick={() => navigate('/app/profile')}><span className="avatar avatar-small">{user?.full_name?.slice(0, 1).toUpperCase() || 'C'}</span><span>{user?.full_name?.split(' ')[0] || 'Profile'}</span><ChevronDown size={14} /></button>
        </div>
      </header>
      <main className="app-content"><Outlet /></main>
      <footer className="app-footer"><span>© {new Date().getFullYear()} CivicFlow</span><span>Built for clearer civic services in Chandigarh</span><span><ShieldCheck size={13} /> Prototype · not an official government service</span></footer>
    </div>
    <nav className="mobile-bottom-nav" aria-label="Mobile navigation">
      {links.filter(item => item.to !== '/app/report').map(({ to, label, icon: Icon, end }) => <NavLink key={to} end={end} to={to} className={({ isActive }) => `mobile-nav-item ${isActive ? 'active' : ''}`}><Icon size={19} /><span>{label === 'Overview' ? 'Home' : label === 'My reports' ? 'Reports' : 'Map'}</span></NavLink>)}
      <button className="mobile-nav-item mobile-report" onClick={() => navigate('/app/report')}><span className="mobile-report-icon"><FilePlus2 size={20} /></span><span>Report</span></button>
    </nav>
  </div>;
}
