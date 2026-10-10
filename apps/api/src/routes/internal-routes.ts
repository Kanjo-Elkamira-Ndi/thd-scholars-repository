import { Router } from 'express';
import { getUserStatus } from '../controllers/internal-status-controller';
import { asyncHandler } from '../middleware/async-handler';

const router = Router();

router.get('/users/:telegramId/status', asyncHandler(getUserStatus));

export default router;
