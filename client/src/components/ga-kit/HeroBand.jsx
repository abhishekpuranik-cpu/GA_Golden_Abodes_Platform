import '../../theme/ga-module.css';

/**
 * Navy gradient hero band used at the top of module content areas.
 */
export function HeroBand({ eyebrow, title, sub, actions }) {
  return (
    <div className="ga-mod-hero">
      <div className="ga-mod-hero-inner">
        <div>
          {eyebrow ? <div className="ga-mod-hero-eyebrow">{eyebrow}</div> : null}
          {title ? <h1 className="ga-mod-hero-title">{title}</h1> : null}
          {sub ? <div className="ga-mod-hero-sub">{sub}</div> : null}
        </div>
        {actions ? <div className="ga-mod-hero-actions">{actions}</div> : null}
      </div>
    </div>
  );
}
