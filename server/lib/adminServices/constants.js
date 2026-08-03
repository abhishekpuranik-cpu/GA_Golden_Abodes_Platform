/** Admin Services (M9) — shared constants. Entity tags reused from Hiring master list. */
import { ENTITY_TAGS as HIRING_ENTITY_TAGS } from '../hiring/constants.js';

export const APP_ID = 'admin_services';

export const ENTITY_TAGS = [...HIRING_ENTITY_TAGS];

export const TAB_KEYS = ['travel', 'fleet', 'assets', 'facilities', 'vendors', 'utilities', 'compliance'];

export const TAB_SEED = [
  { key: 'travel', displayName: 'Travel & Fuel Claim', route: '/travel', isEnabled: true, sortOrder: 1, requiredPermission: 'ADMIN_SERVICES.TRAVEL.VIEW', iconKey: 'travel' },
  { key: 'fleet', displayName: 'Vehicle & Fleet', route: '/fleet', isEnabled: false, sortOrder: 2, requiredPermission: 'ADMIN_SERVICES.FLEET.VIEW', iconKey: 'fleet' },
  { key: 'assets', displayName: 'Asset Register', route: '/assets', isEnabled: false, sortOrder: 3, requiredPermission: 'ADMIN_SERVICES.ASSETS.VIEW', iconKey: 'assets' },
  { key: 'facilities', displayName: 'Facilities & AMC', route: '/facilities', isEnabled: false, sortOrder: 4, requiredPermission: 'ADMIN_SERVICES.FACILITIES.VIEW', iconKey: 'facilities' },
  { key: 'vendors', displayName: 'Admin Vendors', route: '/vendors', isEnabled: false, sortOrder: 5, requiredPermission: 'ADMIN_SERVICES.VENDORS.VIEW', iconKey: 'vendors' },
  { key: 'utilities', displayName: 'Utilities & Bills', route: '/utilities', isEnabled: false, sortOrder: 6, requiredPermission: 'ADMIN_SERVICES.UTILITIES.VIEW', iconKey: 'utilities' },
  { key: 'compliance', displayName: 'Office Compliance', route: '/compliance', isEnabled: false, sortOrder: 7, requiredPermission: 'ADMIN_SERVICES.COMPLIANCE.VIEW', iconKey: 'compliance' }
];

export const PERMS = {
  TRAVEL_VIEW: 'ADMIN_SERVICES.TRAVEL.VIEW',
  TRAVEL_CLAIM: 'ADMIN_SERVICES.TRAVEL.CLAIM',
  TRAVEL_VERIFY: 'ADMIN_SERVICES.TRAVEL.VERIFY',
  TRAVEL_APPROVE: 'ADMIN_SERVICES.TRAVEL.APPROVE',
  TRAVEL_ADMIN: 'ADMIN_SERVICES.TRAVEL.ADMIN',
  TRAVEL_SETTLE: 'ADMIN_SERVICES.TRAVEL.SETTLE'
};

/** Any of these implies VIEW for the travel tab. */
export const TRAVEL_ANY = [
  PERMS.TRAVEL_VIEW,
  PERMS.TRAVEL_CLAIM,
  PERMS.TRAVEL_VERIFY,
  PERMS.TRAVEL_APPROVE,
  PERMS.TRAVEL_ADMIN,
  PERMS.TRAVEL_SETTLE
];

export const LOCATION_CATEGORIES = [
  'OFFICE', 'PROJECT_SITE', 'AUTHORITY', 'BANK_LENDER',
  'CONSULTANT', 'VENDOR', 'EMPLOYEE_HOME', 'OTHER'
];

export const VEHICLE_TYPES = ['TWO_WHEELER', 'CAR_PETROL', 'CAR_DIESEL', 'CAR_CNG'];

export const TRIP_PURPOSES = [
  'SITE_VISIT', 'AUTHORITY_LIAISON', 'BANK_LENDER',
  'CONSULTANT', 'CLIENT', 'VENDOR_MATERIAL', 'LEGAL', 'OTHER'
];

export const DISTANCE_SOURCES = ['ESTIMATE', 'GOOGLE_MAPS', 'ODOMETER', 'MANUAL'];

export const ANCILLARY_TYPES = ['TOLL', 'PARKING', 'OTHER'];

export const EXCEPTION_FLAGS = [
  'EXC_OVERRIDE', 'EXC_DUPLICATE', 'EXC_BACKDATED', 'EXC_DAILY_CAP',
  'EXC_HOME_LEG', 'EXC_UNVERIFIED', 'EXC_CROSS_ENTITY'
];

export const TRIP_STATUSES = ['DRAFT', 'SUBMITTED', 'VERIFIED', 'RETURNED', 'REJECTED'];

export const CLAIM_STATUSES = ['OPEN', 'SUBMITTED', 'VERIFIED', 'APPROVED', 'RETURNED', 'REJECTED', 'PAID'];

export const DISTANCE_BASIS = ['VERIFIED', 'PARTIAL_ESTIMATE', 'OVERRIDE'];

/** Placeholder rate cards — paise per km. Notes mark PLACEHOLDER. */
export const PLACEHOLDER_RATES_PAISE = {
  TWO_WHEELER: 400,
  CAR_PETROL: 1100,
  CAR_DIESEL: 1000,
  CAR_CNG: 700
};

export const POLICY_DEFAULTS = {
  roadFactor: 1.3,
  dailyCapKm: 150,
  monthlyCapKm: 2500,
  backdatingWindowDays: 7,
  homeToOfficeClaimable: false,
  requireReceiptAboveAncillaryPaise: 10000,
  finalApproverUserId: null,
  alternateApproverUserId: null,
  verifierAssignments: []
};

export const APPROVER_LOOKUP_EMAIL = 'abhishek.puranik@goldenabodes.com';

export const EARTH_RADIUS_KM = 6371;
