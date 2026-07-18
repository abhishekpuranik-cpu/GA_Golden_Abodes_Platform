import '../../theme/ga-shell.css';

export function PageHeader({ eyebrow = 'GOLDEN ABODES', title, actions }) {
  return (
    <header className="ga-page-header">
      {eyebrow ? <div className="ga-page-header-eyebrow">{eyebrow}</div> : null}
      <div className="ga-page-header-row">
        <h1>{title}</h1>
        {actions ? <div className="ga-page-header-actions">{actions}</div> : null}
      </div>
    </header>
  );
}
