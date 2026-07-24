import 'dotenv/config';
import { sql } from '../db/client.js';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const MODEL = 'text-embedding-3-small'; // 1536차원, $0.02/1M토큰
const DIM = 1536;
const BATCH = 96;

if (!OPENAI_API_KEY) { console.error('OPENAI_API_KEY 없음'); process.exit(1); }

// 1) 벡터 컬럼 확보 (pgvector 확장은 이미 설치됨)
await sql`ALTER TABLE practical_problems ADD COLUMN IF NOT EXISTS embedding vector(${sql.unsafe(String(DIM))})`;

// 2) 아직 임베딩 없는 문항
const rows = await sql`
  SELECT id, category, question_text, coalesce(examples,'') AS examples
  FROM practical_problems WHERE embedding IS NULL`;
console.log(`임베딩 대상: ${rows.length}문항`);
if (rows.length === 0) { console.log('이미 전부 임베딩됨'); await sql.end(); process.exit(0); }

const toInput = (r) => `${r.category ? `[${r.category}] ` : ''}${r.question_text}\n${r.examples}`.slice(0, 6000);

async function embedBatch(inputs) {
  const res = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${OPENAI_API_KEY}` },
    body: JSON.stringify({ model: MODEL, input: inputs }),
  });
  if (!res.ok) throw new Error(`openai ${res.status}: ${await res.text()}`);
  return res.json();
}

let done = 0, totalTokens = 0;
for (let i = 0; i < rows.length; i += BATCH) {
  const chunk = rows.slice(i, i + BATCH);
  const data = await embedBatch(chunk.map(toInput));
  totalTokens += data.usage?.total_tokens || 0;
  for (let j = 0; j < chunk.length; j += 1) {
    const vec = `[${data.data[j].embedding.join(',')}]`;
    await sql`UPDATE practical_problems SET embedding = ${vec}::vector WHERE id = ${chunk[j].id}`;
  }
  done += chunk.length;
  console.log(`  ${done}/${rows.length}`);
}

// 3) 코사인 유사도 HNSW 인덱스
await sql`CREATE INDEX IF NOT EXISTS practical_problems_embedding_idx
  ON practical_problems USING hnsw (embedding vector_cosine_ops)`;

const cost = (totalTokens / 1_000_000) * 0.02;
console.log(`완료 — ${done}문항 임베딩 | 토큰 ${totalTokens.toLocaleString()} | 예상비용 $${cost.toFixed(5)}`);
await sql.end();
