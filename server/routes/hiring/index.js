import { Router } from 'express';
import { hiringReady } from '../../lib/hiring/mongoose.js';
import { hiringReadLimiter, hiringWriteLimiter } from '../../lib/hiring/rateLimit.js';
import requisitionsRouter from './requisitions.js';
import candidatesRouter from './candidates.js';
import interviewsRouter from './interviews.js';
import offersRouter from './offers.js';
import dashboardRouter from './dashboard.js';
import healthRouter from './health.js';

const router = Router();

router.use(hiringReady);
router.use((req, res, next) => {
  if (req.path === '/health' || req.path.startsWith('/health/')) return next();
  if (req.method === 'GET' || req.method === 'HEAD') return hiringReadLimiter(req, res, next);
  return hiringWriteLimiter(req, res, next);
});
router.use('/health', healthRouter);
router.use('/requisitions', requisitionsRouter);
router.use('/candidates', candidatesRouter);
router.use('/interviews', interviewsRouter);
router.use('/offers', offersRouter);
router.use('/dashboard', dashboardRouter);

export default router;
