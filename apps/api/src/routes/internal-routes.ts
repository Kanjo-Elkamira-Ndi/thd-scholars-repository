import { Router } from 'express';
import {
  getContentDownload,
  postClaimContent,
  postCompleteContent,
} from '../controllers/internal-content-controller';
import {
  claimJoinRequests,
  completeJoinRequest,
  recordJoinRequest,
} from '../controllers/internal-join-requests-controller';
import { getUserStatus } from '../controllers/internal-status-controller';
import {
  getReconcileTargets,
  postClaimMemberRemovals,
  postConfirmMemberRemoval,
  putMembershipSnapshot,
} from '../controllers/internal-members-controller';
import { asyncHandler } from '../middleware/async-handler';

const router = Router();

router.get('/users/:telegramId/status', asyncHandler(getUserStatus));

router.post('/join-requests', asyncHandler(recordJoinRequest));
router.post('/join-requests/claim', asyncHandler(claimJoinRequests));
router.post('/join-requests/:id/complete', asyncHandler(completeJoinRequest));

router.post('/content/claim', asyncHandler(postClaimContent));
router.post('/content/:id/confirm', asyncHandler(postCompleteContent));
router.get('/content/:id/download', asyncHandler(getContentDownload));

router.get('/members/reconcile-targets', asyncHandler(getReconcileTargets));
router.put('/members/snapshot', asyncHandler(putMembershipSnapshot));
router.post('/members/removals/claim', asyncHandler(postClaimMemberRemovals));
router.post('/members/removals/:id/confirm', asyncHandler(postConfirmMemberRemoval));

export default router;
