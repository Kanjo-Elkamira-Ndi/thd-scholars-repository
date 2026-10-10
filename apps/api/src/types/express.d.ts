import 'express';
import type { User } from '@thd/shared';

declare global {
  namespace Express {
    interface Request {
      id?: string;
      user?: User;
      service?: 'bot';
    }
  }
}
