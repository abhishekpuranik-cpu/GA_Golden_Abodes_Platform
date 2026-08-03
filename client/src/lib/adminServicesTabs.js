export const TRAVEL_SCREENS = [
  { id: 'log', path: 'log', label: 'Log a trip', perms: ['claim'] },
  { id: 'claims', path: 'claims', label: 'My claims', perms: ['claim'] },
  { id: 'verify', path: 'verify', label: 'Verification queue', perms: ['verify'] },
  { id: 'approvals', path: 'approvals', label: 'Approvals', perms: ['approve'] },
  { id: 'locations', path: 'locations', label: 'Locations & distances', perms: ['admin', 'approve'] },
  { id: 'setup', path: 'setup', label: 'Setup', perms: ['admin'] }
];

export function visibleTravelScreens(permissions = {}) {
  return TRAVEL_SCREENS.filter((s) => s.perms.some((p) => permissions[p]));
}

export function formatPaise(paise) {
  const n = Number(paise) || 0;
  return `₹${(n / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatKm(metres) {
  return `${((Number(metres) || 0) / 1000).toFixed(2)} km`;
}

/** Parse Google Maps URL or "lat,lng" paste. */
export function parseLatLng(input) {
  const s = String(input || '').trim();
  const at = s.match(/@(-?\d+\.?\d*),\s*(-?\d+\.?\d*)/);
  if (at) return { lat: Number(at[1]), lng: Number(at[2]) };
  const plain = s.match(/^(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)$/);
  if (plain) return { lat: Number(plain[1]), lng: Number(plain[2]) };
  return null;
}

export const VEHICLE_TYPES = ['TWO_WHEELER', 'CAR_PETROL', 'CAR_DIESEL', 'CAR_CNG'];
export const PURPOSES = [
  'SITE_VISIT', 'AUTHORITY_LIAISON', 'BANK_LENDER',
  'CONSULTANT', 'CLIENT', 'VENDOR_MATERIAL', 'LEGAL', 'OTHER'
];
export const LOCATION_CATEGORIES = [
  'OFFICE', 'PROJECT_SITE', 'AUTHORITY', 'BANK_LENDER',
  'CONSULTANT', 'VENDOR', 'EMPLOYEE_HOME', 'OTHER'
];
