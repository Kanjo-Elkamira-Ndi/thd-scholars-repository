import { Router } from 'express';
import { postRegistration } from '../controllers/registrations-controller';
import { asyncHandler } from '../middleware/async-handler';
import { registrationRateLimiter } from '../middleware/registration-rate-limit';

const router = Router();

router.post('/registrations', registrationRateLimiter, asyncHandler(postRegistration));

export default router;
