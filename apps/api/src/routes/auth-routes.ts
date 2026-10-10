import { Router } from 'express';
import { getMe } from '../controllers/me-controller';
import { asyncHandler } from '../middleware/async-handler';

const router = Router();

router.get('/me', asyncHandler(getMe));

export default router;
