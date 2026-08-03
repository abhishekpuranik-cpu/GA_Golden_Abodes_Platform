import { Router } from 'express';
import locationsRouter from './locations.js';
import distancesRouter from './distances.js';
import tripsRouter from './trips.js';
import claimsRouter from './claims.js';
import approvalsRouter from './approvals.js';
import reportsRouter from './reports.js';
import setupRouter from './setup.js';
import { canViewTravel } from '../../../lib/adminServices/access.js';

const router = Router();

router.use((req, res, next) => {
  if (!canViewTravel(req.authUser)) {
    return res.status(403).json({ error: 'ADMIN_SERVICES.TRAVEL permission required' });
  }
  return next();
});

router.use('/locations', locationsRouter);
router.use('/distances', distancesRouter);
router.use('/trips', tripsRouter);
router.use('/claims', claimsRouter);
router.use('/approvals', approvalsRouter);
router.use('/reports', reportsRouter);
router.use('/setup', setupRouter);

export default router;
