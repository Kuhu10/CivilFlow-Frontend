import { ArrowLeft, BadgeCheck, CalendarDays, LogOut, Mail, ShieldCheck, UserRound } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

export function ProfilePage() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const exit = () => { signOut(); navigate('/'); };
  if (!user) return null;
  return <div className="page-view profile-page"><div className="page-heading-row"><div><div className="eyebrow">ACCOUNT SETTINGS</div><h1>Your profile</h1><p>Account details and workspace information.</p></div><Link className="button button-outline" to="/app"><ArrowLeft size={15} /> Back to overview</Link></div><div className="profile-layout"><section className="surface-card profile-card"><div className="profile-banner"><div className="profile-avatar-xl">{user.full_name.slice(0, 1).toUpperCase()}</div><div><h2>{user.full_name}</h2><p>Community member</p></div><span className="verified-chip"><BadgeCheck size={14} /> Active account</span></div><div className="profile-information"><div className="profile-info-row"><span><UserRound size={17} /> Full name</span><b>{user.full_name}</b></div><div className="profile-info-row"><span><Mail size={17} /> Email</span><b>{user.email}</b></div><div className="profile-info-row"><span><ShieldCheck size={17} /> Account role</span><b className="role-chip">{user.role}</b></div><div className="profile-info-row"><span><CalendarDays size={17} /> Joined</span><b>{new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium' }).format(new Date(user.created_at))}</b></div></div></section><aside className="surface-card profile-safety-card"><span className="profile-safety-icon"><ShieldCheck size={21} /></span><h3>Your account, your reports.</h3><p>Your citizen account can view reports returned for your account. Keep your password private and sign out on shared devices.</p><button className="button button-outline button-full" onClick={exit}><LogOut size={16} /> Sign out</button></aside></div><div className="prototype-note"><ShieldCheck size={15} /> CivicFlow is a prototype workspace. Account details are returned by the connected FastAPI backend.</div></div>;
}
