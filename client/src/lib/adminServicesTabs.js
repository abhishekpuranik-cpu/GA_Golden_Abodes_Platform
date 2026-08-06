export const TRAVEL_SCREENS = [
  { id: 'log', path: 'log', label: 'Log a trip', claimantOk: true },
  { id: 'claims', path: 'claims', label: 'My claims', claimantOk: true },
  { id: 'verify', path: 'verify', label: 'Verification', staffOnly: true },
  { id: 'approvals', path: 'approvals', label: 'Approvals', staffOnly: true, approverOk: true },
  { id: 'locations', path: 'locations', label: 'Locations', staffOnly: true },
  { id: 'setup', path: 'setup', label: 'Setup', staffOnly: true }
];

/**
 * Claimants: Log + My claims only.
 * Designated L1/L2 approvers: + Approvals.
 * Staff (admin / HR / elevated travel perms): all screens.
 */
export function visibleTravelScreens(permissions = {}) {
  const staff = !!permissions.staff;
  const approver = !!permissions.approver || !!permissions.approve;
  return TRAVEL_SCREENS.filter((s) => {
    if (s.staffOnly) {
      if (staff) return true;
      if (s.approverOk && approver) return true;
      return false;
    }
    if (s.claimantOk) return !!permissions.claim || staff;
    return false;
  });
}


export function formatPaise(paise) {
  const n = Number(paise) || 0;
  return `₹${(n / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatKm(metres) {
  return `${((Number(metres) || 0) / 1000).toFixed(2)} km`;
}

/** Human label for claim status including multi-level approve. */
export function claimStatusLabel(status) {
  const s = String(status || '');
  const m = /^AWAITING_L(\d+)$/.exec(s);
  if (m) return `Awaiting L${m[1]}`;
  return s || '—';
}

export function claimStatusTone(status) {
  const s = String(status || '');
  if (['APPROVED', 'PAID', 'VERIFIED'].includes(s)) return 'success';
  if (/^AWAITING_L\d+$/.test(s)) return 'warning';
  if (s === 'RETURNED') return 'warning';
  if (s === 'REJECTED') return 'danger';
  return 'neutral';
}

export function parseLatLng(input) {
  const s = String(input || '').trim();
  const at = s.match(/@(-?\d+\.?\d*),\s*(-?\d+\.?\d*)/);
  if (at) return { lat: Number(at[1]), lng: Number(at[2]) };
  const plain = s.match(/^(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)$/);
  if (plain) return { lat: Number(plain[1]), lng: Number(plain[2]) };
  return null;
}

export const VEHICLE_TYPES = [
  { id: 'TWO_WHEELER', label: 'Two-wheeler' },
  { id: 'CAR_PETROL', label: 'Car · Petrol' },
  { id: 'CAR_DIESEL', label: 'Car · Diesel' },
  { id: 'CAR_CNG', label: 'Car · CNG' }
];

export const PURPOSES = [
  { id: 'SITE_VISIT', label: 'Site visit' },
  { id: 'AUTHORITY_LIAISON', label: 'Authority liaison' },
  { id: 'BANK_LENDER', label: 'Bank / lender' },
  { id: 'CONSULTANT', label: 'Consultant' },
  { id: 'CLIENT', label: 'Client' },
  { id: 'VENDOR_MATERIAL', label: 'Vendor / material' },
  { id: 'LEGAL', label: 'Legal' },
  { id: 'OTHER', label: 'Other' }
];

export const LOCATION_CATEGORIES = [
  'OFFICE', 'PROJECT_SITE', 'AUTHORITY', 'BANK_LENDER',
  'CONSULTANT', 'VENDOR', 'EMPLOYEE_HOME', 'OTHER'
];
