import { useState } from 'react';
import { formatINR, rupeesToPaise } from '../../lib/hiring/formatINR.js';

export default function MoneyInput({ label, valuePaise, onChangePaise, placeholder }) {
  const [display, setDisplay] = useState(
    valuePaise != null ? String(Number(valuePaise) / 100) : ''
  );

  function commit(val) {
    const paise = rupeesToPaise(val);
    onChangePaise?.(paise);
  }

  return (
    <div className="hr-form-row">
      {label && <label>{label}</label>}
      <input
        type="text"
        inputMode="decimal"
        placeholder={placeholder || 'Amount in ₹'}
        value={display}
        onChange={(e) => setDisplay(e.target.value)}
        onBlur={() => commit(display)}
      />
      {valuePaise != null && (
        <span className="hr-muted">{formatINR(valuePaise)}</span>
      )}
    </div>
  );
}
