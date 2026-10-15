import { ArrowDownRight, ArrowRight, ArrowUpRight, CheckCircle2, CircleDot, ClipboardCheck, FilePlus2, Leaf, MapPinned, ShieldCheck, Sparkles } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { Logo, Wordmark } from '../components/Logo';
import { VideoBackground } from '../components/VideoBackground';
import { useAuth } from '../auth/AuthContext';

const featureCards = [
  { icon: FilePlus2, title: 'Report clearly', text: 'Share the issue, choose a sector and attach a photo when it helps.' },
  { icon: Sparkles, title: 'Triage with context', text: 'AI-assisted suggestions help structure reports for human review.' },
  { icon: ClipboardCheck, title: 'Follow every update', text: 'Keep your own reports and their latest status in one place.' },
];

export function LandingPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  return <div className="marketing-page">
    <header className="marketing-nav"><Logo /><nav className="marketing-links"><a href="#how-it-works">How it works</a><a href="#why-civicflow">Why CivicFlow</a></nav><div className="marketing-actions">{user ? <Link className="button button-primary button-small" to="/app">Open workspace <ArrowUpRight size={16} /></Link> : <><Link className="button button-quiet button-small" to="/login">Log in</Link><Link className="button button-primary button-small" to="/register">Get started <ArrowRight size={15} /></Link></>}</div></header>
    <main>
      <section className="hero">
        <VideoBackground src="/videos/city-sunrise.mp4" poster="/images/city-sunrise.jpg" className="hero-video" />
        <div className="hero-grid-texture" />
        <div className="hero-content site-container">
          <Wordmark />
          <h1>Smarter cities.<br /><span>Stronger communities.</span></h1>
          <p className="hero-description">Report a civic issue. Follow the progress. Help make your neighborhood cleaner, safer, and better connected.</p>
          <div className="hero-actions"><button className="button button-bright button-large" onClick={() => navigate(user ? '/app/report' : '/register')}>Report an issue <ArrowRight size={17} /></button><a className="hero-secondary" href="#how-it-works">See how it works <ArrowDownRight size={16} /></a></div>
          <div className="hero-footnote"><span className="live-dot" /> Made for the everyday details that make a city better</div>
        </div>
        <div className="hero-side-note"><span>01 / 03</span><i /><span>Chandigarh · Community services</span></div>
        <div className="hero-scroll">SCROLL TO EXPLORE <span /></div>
      </section>

      <section className="intro-strip site-container" id="why-civicflow">
        <div className="intro-index"><span>01</span><i /></div>
        <div className="intro-headline"><div className="eyebrow">Civic life, connected</div><h2>A better city starts<br />with being heard.</h2></div>
        <div className="intro-copy"><p>Small issues deserve clear next steps. CivicFlow gives residents a straightforward way to report local problems and follow their progress, while helping service teams organize the information.</p><Link to={user ? '/app' : '/register'} className="inline-link">Explore the workspace <ArrowUpRight size={16} /></Link></div>
      </section>

      <section className="features-section" id="how-it-works">
        <div className="site-container">
          <div className="section-heading-row"><div><div className="eyebrow">From report to next step</div><h2>Simple for residents.<br /><span>Useful for city teams.</span></h2></div><p>Less guesswork. Clearer details. A better view of what needs attention.</p></div>
          <div className="feature-grid">{featureCards.map((item, index) => <article className="feature-card" key={item.title}><div className="feature-card-top"><span className="feature-number">0{index + 1}</span><span className="feature-icon"><item.icon size={20} /></span></div><h3>{item.title}</h3><p>{item.text}</p><div className="feature-underline" /></article>)}</div>
        </div>
      </section>

      <section className="story-section">
        <div className="story-media"><VideoBackground src="/videos/civic-street.mp4" poster="/images/civic-street.jpg" className="story-video" /><div className="story-caption"><span>02 / On the ground</span><b>Better streets are built together.</b></div></div>
        <div className="story-copy"><div className="eyebrow">Real issues. Clearer action.</div><h2>From the street<br />to the right team.</h2><p>Capture what happened, add useful location details, and let AI-assisted triage suggest a category and first action. People stay in control of the decisions.</p><div className="story-points"><span><CheckCircle2 size={17} /> Human-reviewed suggestions</span><span><CheckCircle2 size={17} /> Report status in one place</span><span><CheckCircle2 size={17} /> Photo evidence when useful</span></div><button className="button button-primary" onClick={() => navigate(user ? '/app/report' : '/register')}>Start a report <ArrowRight size={16} /></button></div>
      </section>

      <section className="values-section site-container">
        <div className="values-intro"><div className="eyebrow">Designed with care</div><h2>Technology should<br />make civic life clearer.</h2><p>CivicFlow is a prototype exploring a more transparent journey from report to resolution.</p></div>
        <div className="value-item"><span><ShieldCheck size={20} /></span><div><h3>Human decisions</h3><p>AI offers suggestions, while people review and decide what happens next.</p></div></div>
        <div className="value-item"><span><MapPinned size={20} /></span><div><h3>Location with context</h3><p>Reports can include a sector and a selected map location.</p></div></div>
        <div className="value-item"><span><Leaf size={20} /></span><div><h3>Built for everyday impact</h3><p>Small maintenance issues matter to the people living around them.</p></div></div>
      </section>

      <section className="closing-cta"><VideoBackground src="/videos/technology-grid.mp4" className="closing-video" poster="/images/technology-grid.jpg" /><div className="closing-inner site-container"><div className="eyebrow eyebrow-light">One clear next step</div><h2>Make your neighborhood<br />a little better today.</h2><p>Your report can help the right people understand what needs attention.</p><button className="button button-bright button-large" onClick={() => navigate(user ? '/app/report' : '/register')}>Get started <ArrowRight size={17} /></button><span className="closing-note"><CircleDot size={13} /> CivicFlow community prototype · Chandigarh</span></div></section>
    </main>
    <footer className="marketing-footer site-container"><Logo /><span>Report. Track. Improve.</span><div><Link to="/login">Login</Link><a href="#why-civicflow">About</a><a href="#how-it-works">How it works</a></div><small>Prototype only · Not an official government service</small></footer>
  </div>;
}
