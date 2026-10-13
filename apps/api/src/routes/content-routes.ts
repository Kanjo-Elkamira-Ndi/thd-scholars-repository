import { Router } from 'express';
import {
  deleteContent,
  getContent,
  getContentById,
  patchContent,
  postContent,
} from '../controllers/content-controller';
import { asyncHandler } from '../middleware/async-handler';
import { requireRole } from '../middleware/require-role';
import { requireVerifiedMember } from '../middleware/require-verified-member';
import { uploadSingle } from '../middleware/upload';

const router = Router();

router.get('/content', requireVerifiedMember, asyncHandler(getContent));
router.get('/content/:id', requireVerifiedMember, asyncHandler(getContentById));
router.post('/content', requireRole('faculty', 'admin'), uploadSingle, asyncHandler(postContent));
router.patch('/content/:id', requireRole('faculty', 'admin'), asyncHandler(patchContent));
router.delete('/content/:id', requireRole('faculty', 'admin'), asyncHandler(deleteContent));

export default router;
