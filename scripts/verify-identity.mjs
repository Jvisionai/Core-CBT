import 'dotenv/config';
import { eq } from 'drizzle-orm';
import { db, sql, schema } from '../db/client.js';

const SUPA = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const TABLE = process.env.SUPABASE_PROBLEM_OUTCOMES_TABLE || 'problem_outcomes';

const res = await fetch(
  `${SUPA}/rest/v1/${TABLE}?select=source_session_id,source_problem_number&source_session_id=like.practical-industrial*`,
  { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } },
);
const outcomes = await res.json();

const srcRows = await db.select().from(schema.sources).where(eq(schema.sources.examType, 'practical'));
const keyToId = new Map(srcRows.map((s) => [s.key, s.id]));
const probRows = await db
  .select({ sourceId: schema.practicalProblems.sourceId, no: schema.practicalProblems.problemNo })
  .from(schema.practicalProblems);
const have = new Set(probRows.map((p) => `${p.sourceId}:${p.no}`));

let ok = 0;
const orphan = [];
for (const o of outcomes) {
  const sid = keyToId.get(o.source_session_id);
  const hit = sid && have.has(`${sid}:${Number(o.source_problem_number)}`);
  if (hit) ok += 1; else orphan.push(`${o.source_session_id}#${o.source_problem_number}`);
}
console.log(`실기 outcome ${outcomes.length}건 | 재연결 ${ok} | 고아 ${orphan.length}`);
if (orphan.length) console.log('고아:', [...new Set(orphan)].slice(0, 20));
await sql.end();
process.exit(orphan.length ? 1 : 0);
