export const APP_IDS = {
  V1_CASHFLOW: 'v1_cashflow',
  V2_RESOURCE_PLANNER: 'v2_resource_planner',
  V3_ORG_PLANNER: 'v3_org_planner',
  PRECONSTRUCTION: 'preconstruction',
  DM_SPV_GOVERNANCE: 'dm_spv_governance',
  POST_SALES: 'post_sales',
  HIRING: 'hiring',
  ADMIN_SERVICES: 'admin_services'
};

export const APP_LOCAL_STORAGE_KEYS = {
  [APP_IDS.V1_CASHFLOW]: [
    'ga_cf_v1',
    'ga_cf_v1_mirror',
    'ga_v1_building_filter',
    'ga_cf_tally_settings',
    'ga_v1_show_prior_years',
    'ga_cloud_url',
    'ga_user_name'
  ],
  [APP_IDS.V2_RESOURCE_PLANNER]: [
    'ga_rp_state_v1',
    'ga_v2_proj_costs',
    'ga_jd_data',
    'ga_pnl_mktg',
    'ga_team_snapshots',
    'ga_rp_projects',
    'ga_cloud_url',
    'ga_user_name'
  ],
  [APP_IDS.V3_ORG_PLANNER]: [
    'ga_planner_state_v1',
    'ga_rp_projects',
    'ga_v3_cf_sync',
    'ga_v3_money_crores',
    'ga_v3_last_manual_save',
    'ga_cloud_url',
    'ga_user_name'
  ]
};
