import { Router } from 'express';
import { adminServicesReady } from '../../lib/adminServices/mongoose.js';
import tabsRouter from './tabs.js';
import travelRouter from './travel/index.js';

const router = Router();

router.use(adminServicesReady);
router.use(tabsRouter);
router.use('/travel', travelRouter);

export default router;
