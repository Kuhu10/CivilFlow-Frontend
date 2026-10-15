import { useState, type FormEvent } from 'react';
import { ArrowLeft, ArrowRight, Eye, EyeOff, LockKeyhole, Mail, ShieldCheck, UserRound } from 'lucide-react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { ApiError } from '../api/client';
import { Logo } from '../components/Logo';
import { VideoBackground } from '../components/VideoBackground';

export function AuthPage({ mode }: { mode: 'login' | 'register' }) {
  const isRegister = mode === 'register';
  const { user, signIn, signUp } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (user) {
    const dest = user.role === 'admin' || user.role === 'officer' ? '/admin' : '/app';
    return <Navigate to={dest} replace />;
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault(); setError(''); setBusy(true);
    try {
      if (isRegister) {
        await signUp(name.trim(), email.trim(), password);
        navigate('/app', { replace: true });
      } else {
        await signIn(email.trim(), password);
        const saved = sessionStorage.getItem('civicflow_user');
        let role = 'citizen';
        try {
          role = (JSON.parse(saved || '{}') as { role?: string }).role || 'citizen';
        } catch {
          // ignore parse error
        }
        const next = params.get('next');
        if (role === 'superadmin') {
          navigate(next && (next.startsWith('/superadmin') || next.startsWith('/admin')) ? next : '/superadmin', { replace: true });
        } else if (role === 'admin' || role === 'officer') {
          navigate(next && next.startsWith('/admin') ? next : '/admin', { replace: true });
        } else {
          navigate(next && next.startsWith('/app') ? next : '/app', { replace: true });
        }
      }
    } catch (err) {
      const apiError = err as ApiError;
      setError(apiError.message || 'Something went wrong. Please try again.');
    } finally { setBusy(false); }
  };

  return <div className="auth-layout">
    <section className="auth-visual"><VideoBackground src="/videos/city-sunrise.mp4" className="auth-video" poster="/images/city-sunrise.jpg" /><div className="auth-visual-top"><Logo light /><Link to="/" className="back-to-site"><ArrowLeft size={15} /> Back to site</Link></div><div className="auth-visual-copy"><span className="eyebrow eyebrow-light">Report. Track. Improve.</span><h1>Small actions.<br /><em>Better everyday.</em></h1><p>A simple place to report local issues and keep up with what happens next.</p><div className="auth-proof"><span><ShieldCheck size={16} /> Account-protected reports</span><span><Mail size={16} /> Updates in one place</span></div></div><div className="auth-visual-foot">CivicFlow · Community services prototype</div></section>
    <section className="auth-form-side"><div className="auth-mobile-brand"><Logo /></div><div className="auth-form-wrap"><div className="auth-kicker">YOUR CIVICFLOW ACCOUNT</div><h2>{isRegister ? 'Join your community.' : 'Welcome back.'}</h2><p className="auth-lede">{isRegister ? 'Create an account to report and track civic issues.' : 'Sign in to pick up where you left off.'}</p>
      <form onSubmit={submit} className="auth-form">
        {isRegister && <label className="field-label">Full name<span className="field-wrap"><UserRound size={17} /><input autoComplete="name" required minLength={2} maxLength={120} value={name} onChange={e => setName(e.target.value)} placeholder="How should we call you?" /></span></label>}
        <label className="field-label">Email address<span className="field-wrap"><Mail size={17} /><input type="email" autoComplete="email" required maxLength={320} value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" /></span></label>
        <label className="field-label">Password<span className="field-wrap"><LockKeyhole size={17} /><input type={showPassword ? 'text' : 'password'} autoComplete={isRegister ? 'new-password' : 'current-password'} required minLength={isRegister ? 4 : 1} maxLength={128} value={password} onChange={e => setPassword(e.target.value)} placeholder={isRegister ? 'At least 4 characters' : 'Enter your password'} /><button type="button" className="password-toggle" onClick={() => setShowPassword(v => !v)} aria-label={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button></span>{isRegister && <span className="field-help">Use at least 4 characters. Choose a password you haven't used elsewhere.</span>}</label>
        {error && <div className="form-error" role="alert">{error}</div>}
        <button disabled={busy} className="button button-primary button-full button-large" type="submit">{busy ? 'Please wait…' : isRegister ? 'Create account' : 'Sign in'} {!busy && <ArrowRight size={17} />}</button>
      </form>
      <div className="auth-switch">{isRegister ? 'Already have an account?' : 'New to CivicFlow?'} <Link to={isRegister ? '/login' : '/register'}>{isRegister ? 'Sign in' : 'Create an account'}</Link></div>
      <div className="auth-privacy"><ShieldCheck size={16} /><p>Your account is for this prototype workspace. Never use a password you rely on for other services.</p></div>
    </div><div className="auth-footnote">By continuing, you acknowledge this is a civic-service prototype, not an official government reporting channel.</div></section>
  </div>;
}
