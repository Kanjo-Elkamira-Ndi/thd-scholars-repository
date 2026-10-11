import { Router } from 'express';
import {
  claimJoinRequests,
  completeJoinRequest,
  recordJoinRequest,
} from '../controllers/internal-join-requests-controller';
import { getUserStatus } from '../controllers/internal-status-controller';
import { asyncHandler } from '../middleware/async-handler';

const router = Router();

router.get('/users/:telegramId/status', asyncHandler(getUserStatus));

router.post('/join-requests', asyncHandler(recordJoinRequest));
router.post('/join-requests/claim', asyncHandler(claimJoinRequests));
router.post('/join-requests/:id/complete', asyncHandler(completeJoinRequest));

export default router;
