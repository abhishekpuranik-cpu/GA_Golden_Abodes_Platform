export default function VerdictButtons({ onSelect, disabled }) {
  return (
    <div className="hr-verdict-row">
      {['YES', 'MAYBE', 'NO'].map((v) => (
        <button
          key={v}
          type="button"
          className={`hr-btn hr-btn-sm ${v === 'YES' ? 'hr-btn-gold' : 'hr-btn-outline'}`}
          disabled={disabled}
          onClick={() => onSelect(v)}
        >
          {v}
        </button>
      ))}
    </div>
  );
}
