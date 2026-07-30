import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { APP_IDS, APP_LOCAL_STORAGE_KEYS } from './appRegistry.js';
import LegacyAppShell from './pages/LegacyAppShell.jsx';
import RequireAuth from './components/RequireAuth.jsx';

const VaultHome = lazy(() => import('./pages/VaultHome.jsx'));
const AccessPage = lazy(() => import('./pages/AccessPage.jsx'));
const AdminSecurityPage = lazy(() => import('./pages/AdminSecurityPage.jsx'));
const DmGovernanceLayout = lazy(() => import('./pages/dmGovernance/DmGovernanceLayout.jsx'));
const DmBusinessHealthPage = lazy(() => import('./pages/dmGovernance/DmBusinessHealthPage.jsx'));
const DmPortfolioCalendarPage = lazy(() => import('./pages/dmGovernance/DmPortfolioCalendarPage.jsx'));
const DmSpvListPage = lazy(() => import('./pages/dmGovernance/DmSpvListPage.jsx'));
const DmSpvDetailPage = lazy(() => import('./pages/dmGovernance/DmSpvDetailPage.jsx'));
const DmProjectListPage = lazy(() => import('./pages/dmGovernance/DmProjectListPage.jsx'));
const DmProjectDetailPage = lazy(() => import('./pages/dmGovernance/DmProjectDetailPage.jsx'));
const DmBillingConfigPage = lazy(() => import('./pages/dmGovernance/DmBillingConfigPage.jsx'));
const DmBillingWorkspacePage = lazy(() => import('./pages/dmGovernance/DmBillingWorkspacePage.jsx'));
const DmInvoiceRegisterPage = lazy(() => import('./pages/dmGovernance/DmInvoiceRegisterPage.jsx'));
const DmInvoiceDetailPage = lazy(() => import('./pages/dmGovernance/DmInvoiceDetailPage.jsx'));
const DmApprovalInboxPage = lazy(() => import('./pages/dmGovernance/DmApprovalInboxPage.jsx'));
const DmExpensesPage = lazy(() => import('./pages/dmGovernance/DmExpensesPage.jsx'));
const DmReconciliationPage = lazy(() => import('./pages/dmGovernance/DmReconciliationPage.jsx'));
const DmCompliancePage = lazy(() => import('./pages/dmGovernance/DmCompliancePage.jsx'));
const DmRiskPage = lazy(() => import('./pages/dmGovernance/DmRiskPage.jsx'));
const DmReportsPage = lazy(() => import('./pages/dmGovernance/DmReportsPage.jsx'));
const DmScenarioPage = lazy(() => import('./pages/dmGovernance/DmScenarioPage.jsx'));
const DmExecutivePage = lazy(() => import('./pages/dmGovernance/DmExecutivePage.jsx'));
const DmAlertsPage = lazy(() => import('./pages/dmGovernance/DmAlertsPage.jsx'));
const DmIntegrationsPage = lazy(() => import('./pages/dmGovernance/DmIntegrationsPage.jsx'));
const PostSalesLayout = lazy(() => import('./pages/postsales/PostSalesLayout.jsx'));
const PsDashboard = lazy(() => import('./pages/postsales/Dashboard.jsx'));
const PsUnits = lazy(() => import('./pages/postsales/Units.jsx'));
const PsMyTasks = lazy(() => import('./pages/postsales/MyTasks.jsx'));
const PsWorkAllocation = lazy(() => import('./pages/postsales/WorkAllocation.jsx'));
const PsUnitPipeline = lazy(() => import('./pages/postsales/UnitPipeline.jsx'));
const PsDocuments = lazy(() => import('./pages/postsales/Documents.jsx'));
const PsDemands = lazy(() => import('./pages/postsales/Demands.jsx'));
const PsLoans = lazy(() => import('./pages/postsales/Loans.jsx'));
const PsTickets = lazy(() => import('./pages/postsales/Tickets.jsx'));
const PsMilestones = lazy(() => import('./pages/postsales/Milestones.jsx'));
const PsReports = lazy(() => import('./pages/postsales/Reports.jsx'));
const PsInventorySetup = lazy(() => import('./pages/postsales/InventorySetup.jsx'));
const HiringLayout = lazy(() => import('./pages/hiring/HiringLayout.jsx'));
const HrRequisitionBoard = lazy(() => import('./pages/hiring/RequisitionBoard.jsx'));
const HrRequisitionDetail = lazy(() => import('./pages/hiring/RequisitionDetail.jsx'));
const HrCandidateProfile = lazy(() => import('./pages/hiring/CandidateProfile.jsx'));
const HrInterviewCalendar = lazy(() => import('./pages/hiring/InterviewCalendar.jsx'));
const HrCtcGenerator = lazy(() => import('./pages/hiring/CtcGenerator.jsx'));
const HrDashboardLayout = lazy(() => import('./pages/hiring/HiringDashboardLayout.jsx'));
const HrKpisTab = lazy(() => import('./pages/hiring/HiringKpisTab.jsx'));
const HrRequirementsTab = lazy(() => import('./pages/hiring/HiringRequirementsTab.jsx'));
const HrActivityLogTab = lazy(() => import('./pages/hiring/HiringActivityLogTab.jsx'));

function Fall() {
  return (
    <div
      style={{
        minHeight: '40vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#94a3b8',
        fontFamily: 'system-ui'
      }}
    >
      Loading…
    </div>
  );
}

function PostSalesRedirect() {
  const location = useLocation();
  const tail = location.pathname.replace(/^\/post-sales/, '') || '';
  return <Navigate to={`/app/post-sales${tail}${location.search}${location.hash}`} replace />;
}

function HiringRedirect() {
  const location = useLocation();
  const tail = location.pathname.replace(/^\/hiring/, '') || '';
  return <Navigate to={`/app/hiring${tail}${location.search}${location.hash}`} replace />;
}

export default function App() {
  return (
    <Suspense fallback={<Fall />}>
      <Routes>
        <Route
          path="/"
          element={
            <RequireAuth>
              <VaultHome />
            </RequireAuth>
          }
        />
        <Route path="/access" element={<AccessPage />} />
        <Route
          path="/admin/security"
          element={
            <RequireAuth permission="manage_security" appId="admin_security">
              <AdminSecurityPage />
            </RequireAuth>
          }
        />
        <Route
          path="/app/resource-planner"
          element={
            <RequireAuth appId="v2_resource_planner">
              <LegacyAppShell
                title="Resource Planner (V2)"
                htmlFile="GA_ResourcePlanner_V2.html"
                appId={APP_IDS.V2_RESOURCE_PLANNER}
                keysList={APP_LOCAL_STORAGE_KEYS[APP_IDS.V2_RESOURCE_PLANNER]}
                workspaceBlobKey="ga_rp_state_v1"
              />
            </RequireAuth>
          }
        />
        <Route
          path="/app/org-planner"
          element={
            <RequireAuth appId="v3_project_acquisition">
              <LegacyAppShell
                title="Project Acquisition (V3)"
                htmlFile="GA_OrgResourcePlanner_V3.html"
                htmlCacheVersion="20260730.4"
                appId={APP_IDS.V3_ORG_PLANNER}
                keysList={APP_LOCAL_STORAGE_KEYS[APP_IDS.V3_ORG_PLANNER]}
                workspaceBlobKey="ga_planner_state_v1"
                defaultAutoSave={false}
              />
            </RequireAuth>
          }
        />
        <Route
          path="/app/dm-governance"
          element={
            <RequireAuth appId={APP_IDS.DM_SPV_GOVERNANCE}>
              <DmGovernanceLayout />
            </RequireAuth>
          }
        >
          <Route index element={<DmBusinessHealthPage />} />
          <Route path="calendar" element={<DmPortfolioCalendarPage />} />
          <Route path="spvs" element={<DmSpvListPage />} />
          <Route path="spvs/:spvId" element={<DmSpvDetailPage />} />
          <Route path="projects" element={<DmProjectListPage />} />
          <Route path="projects/:projectId" element={<DmProjectDetailPage />} />
          <Route path="billing" element={<DmBillingConfigPage />} />
          <Route path="billing/:projectId" element={<DmBillingConfigPage />} />
          <Route path="billing-workspace" element={<DmBillingWorkspacePage />} />
          <Route path="billing-workspace/:projectId" element={<DmBillingWorkspacePage />} />
          <Route path="invoices" element={<DmInvoiceRegisterPage />} />
          <Route path="invoices/:invoiceId" element={<DmInvoiceDetailPage />} />
          <Route path="approvals" element={<DmApprovalInboxPage />} />
          <Route path="expenses" element={<DmExpensesPage />} />
          <Route path="reconciliation" element={<DmReconciliationPage />} />
          <Route path="compliance" element={<DmCompliancePage />} />
          <Route path="risks" element={<DmRiskPage />} />
          <Route path="scenarios" element={<DmScenarioPage />} />
          <Route path="executive" element={<DmExecutivePage />} />
          <Route path="alerts" element={<DmAlertsPage />} />
          <Route path="reports" element={<DmReportsPage />} />
          <Route path="integrations" element={<DmIntegrationsPage />} />
        </Route>
        <Route
          path="/app/post-sales"
          element={
            <RequireAuth appId={APP_IDS.POST_SALES}>
              <PostSalesLayout />
            </RequireAuth>
          }
        >
          <Route index element={<PsDashboard />} />
          <Route path="my-tasks" element={<PsMyTasks />} />
          <Route path="allocation" element={<PsWorkAllocation />} />
          <Route path="units" element={<PsUnits />} />
          <Route path="inventory" element={<PsInventorySetup />} />
          <Route path="units/:id" element={<PsUnitPipeline />} />
          <Route path="documents" element={<PsDocuments />} />
          <Route path="demands" element={<PsDemands />} />
          <Route path="loans" element={<PsLoans />} />
          <Route path="tickets" element={<PsTickets />} />
          <Route path="milestones" element={<PsMilestones />} />
          <Route path="reports" element={<PsReports />} />
        </Route>
        <Route path="/post-sales/*" element={<PostSalesRedirect />} />
        <Route
          path="/app/hiring"
          element={
            <RequireAuth appId={APP_IDS.HIRING}>
              <HiringLayout />
            </RequireAuth>
          }
        >
          <Route index element={<HrRequisitionBoard />} />
          <Route path="req/:id" element={<HrRequisitionDetail />} />
          <Route path="req/:id/candidate/:cid" element={<HrCandidateProfile />} />
          <Route path="interviews" element={<HrInterviewCalendar />} />
          <Route path="ctc" element={<HrCtcGenerator />} />
          <Route path="dashboard" element={<HrDashboardLayout />}>
            <Route index element={<HrKpisTab />} />
            <Route path="requirements" element={<HrRequirementsTab />} />
            <Route path="activity" element={<HrActivityLogTab />} />
          </Route>
        </Route>
        <Route path="/hiring/*" element={<HiringRedirect />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
