import { Router } from 'express';
import {
  getRoster,
  getRosterById,
  patchRoster,
  postRoster,
} from '../controllers/roster-controller';
import { asyncHandler } from '../middleware/async-handler';
import { requireRole } from '../middleware/require-role';

const router = Router();

router.use(requireRole('registrar', 'admin'));
router.get('/roster', asyncHandler(getRoster));
router.post('/roster', asyncHandler(postRoster));
router.get('/roster/:id', asyncHandler(getRosterById));
router.patch('/roster/:id', asyncHandler(patchRoster));

export default router;
