import { PlatformShell } from './PlatformShell.jsx';
import { SidebarChrome } from './ga-kit/SidebarChrome.jsx';
import { HeroBand } from './ga-kit/HeroBand.jsx';
import '../theme/ga-module.css';

/**
 * PlatformShell + SidebarChrome + HeroBand wrapping module content.
 * `navItems` keeps the same `{path, label, end}` shape every module's nav
 * array already uses (HIRING_NAV, PS_NAV, DM_NAV, ...) — same paths/labels,
 * just rendered in the left chrome instead of a horizontal bar.
 *
 * Ask AI stays a sibling after `children` — callers keep rendering their own
 * <VaultAskAi /> below <ModuleFrame> content as before.
 */
export function ModuleFrame({
  title,
  breadcrumb,
  eyebrow = 'GOLDEN ABODES',
  heroTitle,
  heroSub,
  heroActions,
  navItems = [],
  brandTitle,
  brandSub,
  footBrand,
  footLine,
  vaultLinkLabel = '← Vault',
  children,
}) {
  const sidebarItems = navItems.map((n) => ({ to: n.path, label: n.label, end: n.end }));
  return (
    <PlatformShell title={title} breadcrumb={breadcrumb}>
      <div className="ga-mod ga-page-enter">
        <SidebarChrome
          brandTitle={brandTitle || title}
          brandSub={brandSub}
          items={sidebarItems}
          footBrand={footBrand}
          footLine={footLine}
          vaultLinkLabel={vaultLinkLabel}
        />
        <div className="ga-mod-main">
          <HeroBand eyebrow={eyebrow} title={heroTitle || title} sub={heroSub} actions={heroActions} />
          <div className="ga-mod-content">{children}</div>
        </div>
      </div>
    </PlatformShell>
  );
}
