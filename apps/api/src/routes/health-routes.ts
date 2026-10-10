import { Router } from 'express';
import { getHealth } from '../controllers/health-controller';
import { asyncHandler } from '../middleware/async-handler';

const router = Router();

router.get('/health', asyncHandler(getHealth));

export default router;
