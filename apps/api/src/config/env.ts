import path from 'node:path';
import { config } from 'dotenv';

config({ path: path.join(__dirname, '..', '..', '.env') });
