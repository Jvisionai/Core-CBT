import 'dotenv/config';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from './schema.js';

const sql = postgres(process.env.DATABASE_URL, { max: 4 });
export const db = drizzle(sql, { schema });
export { sql, schema };
