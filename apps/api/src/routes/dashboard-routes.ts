import { Router } from 'express';
import { getDashboard } from '../controllers/dashboard-controller';
import { asyncHandler } from '../middleware/async-handler';

const router = Router();

router.get('/dashboard', asyncHandler(getDashboard));

export default router;
