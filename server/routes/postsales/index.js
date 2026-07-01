import { Router } from 'express';
import { postSalesReady } from '../../lib/postsales/mongoose.js';
import customersRouter from './customers.js';
import unitsRouter from './units.js';
import stepsRouter from './steps.js';
import documentsRouter from './documents.js';
import demandsRouter from './demands.js';
import loansRouter from './loans.js';
import ticketsRouter from './tickets.js';
import milestonesRouter from './milestones.js';
import possessionRouter from './possession.js';
import chsRouter from './chs.js';
import dashboardRouter from './dashboard.js';
import tasksRouter from './tasks.js';
import inventoryRouter from './inventory.js';
import allocationRouter from './allocation.js';
import bootstrapRouter from './bootstrap.js';
import reportsRouter from './reports.js';
import clpScheduleRouter from './clpSchedule.js';
import clpLetterTasksRouter from './clpLetterTasks.js';

const router = Router();

router.use(postSalesReady);

router.use('/customers', customersRouter);
router.use('/units', unitsRouter);
router.use('/units/:unitId/steps', stepsRouter);
router.use('/steps', stepsRouter);
router.use('/documents', documentsRouter);
router.use('/demands', demandsRouter);
router.use('/loans', loansRouter);
router.use('/tickets', ticketsRouter);
router.use('/milestones', milestonesRouter);
router.use('/milestones', clpScheduleRouter);
router.use('/possession', possessionRouter);
router.use('/chs', chsRouter);
router.use('/dashboard', dashboardRouter);
router.use('/tasks', tasksRouter);
router.use('/allocation', allocationRouter);
router.use('/bootstrap', bootstrapRouter);
router.use('/inventory', inventoryRouter);
router.use('/reports', reportsRouter);
router.use('/clp-letter-tasks', clpLetterTasksRouter);

export default router;
