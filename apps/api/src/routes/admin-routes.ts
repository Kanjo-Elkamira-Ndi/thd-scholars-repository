import { Router } from 'express';
import { getAuditLogs, getSettings, patchSettings } from '../controllers/admin-config-controller';
import {
  getMembers,
  getRosterAudit,
  postMemberRemoval,
} from '../controllers/admin-members-controller';
import { getUsers, patchUserRole } from '../controllers/admin-users-controller';
import { asyncHandler } from '../middleware/async-handler';
import { requireRole } from '../middleware/require-role';

const router = Router();

router.get('/users', requireRole('admin'), asyncHandler(getUsers));
router.patch('/users/:id/role', requireRole('admin'), asyncHandler(patchUserRole));

router.get('/audit-logs', requireRole('admin'), asyncHandler(getAuditLogs));
router.get('/settings', requireRole('admin'), asyncHandler(getSettings));
router.patch('/settings', requireRole('admin'), asyncHandler(patchSettings));

router.get('/members', requireRole('admin'), asyncHandler(getMembers));
router.post(
  '/members/:userId/remove',
  requireRole('admin', 'registrar'),
  asyncHandler(postMemberRemoval),
);

router.get('/roster/audit', requireRole('registrar', 'admin'), asyncHandler(getRosterAudit));

export default router;
