import path from 'node:path';
import { config } from 'dotenv';
import { Pool } from 'pg';

config({ path: path.join(__dirname, '..', '..', '.env') });

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL environment variable is not set');
}

const pool = new Pool({ connectionString });

export default pool;
