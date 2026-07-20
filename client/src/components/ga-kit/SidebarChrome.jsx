import { Link, NavLink } from 'react-router-dom';
import '../../theme/ga-module.css';

/**
 * Left chrome navigation for React modules wrapped in <ModuleFrame>.
 * `items` keep the exact same `to`/`label`/`end` contract as the horizontal
 * nav arrays each module already ships (HIRING_NAV, PS_NAV, DM_NAV, ...).
 */
export function SidebarChrome({
  brandTitle,
  brandSub,
  groups,
  items,
  footBrand,
  footLine,
  vaultLinkLabel = '← Vault',
  children,
}) {
  const renderLink = (n) => (
    <NavLink
      key={n.to}
      to={n.to}
      end={n.end}
      className={({ isActive }) => `ga-mod-side-link${isActive ? ' active' : ''}`}
    >
      {n.label}
    </NavLink>
  );

  return (
    <nav className="ga-mod-side" aria-label={brandTitle || 'Module navigation'}>
      <div className="ga-mod-side-brand">
        {brandTitle ? <div className="ga-mod-side-brand-title">{brandTitle}</div> : null}
        {brandSub ? <div className="ga-mod-side-brand-sub">{brandSub}</div> : null}
      </div>
      <div className="ga-mod-side-nav">
        {Array.isArray(groups) && groups.length
          ? groups.map((g) => (
              <div key={g.label}>
                {g.label ? <div className="ga-mod-side-group-label">{g.label}</div> : null}
                {(g.items || []).map(renderLink)}
              </div>
            ))
          : (items || []).map(renderLink)}
      </div>
      {children ? <div className="ga-mod-side-mobile">{children}</div> : null}
      <div className="ga-mod-side-foot">
        {footBrand ? <strong>{footBrand}</strong> : null}
        {footLine ? <span>{footLine}</span> : null}
        <Link to="/" className="ga-mod-side-vault">
          {vaultLinkLabel}
        </Link>
      </div>
    </nav>
  );
}
