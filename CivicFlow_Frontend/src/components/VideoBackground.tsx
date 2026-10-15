import { useEffect, useState } from 'react';

export function VideoBackground({ src, className = '', poster }: { src: string; className?: string; poster?: string }) {
  const [reducedMotion, setReducedMotion] = useState(false);
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(media.matches);
    const update = () => setReducedMotion(media.matches);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  return (
    <div className={`video-bg ${className}`} aria-hidden="true">
      {!reducedMotion && <video className="video-bg-media" autoPlay muted loop playsInline preload="metadata" poster={poster}>
        <source src={src} type="video/mp4" />
      </video>}
      {reducedMotion && poster && <img className="video-bg-media" src={poster} alt="" />}
      <div className="video-bg-shade" />
    </div>
  );
}
