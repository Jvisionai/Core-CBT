import 'dotenv/config';
import fs from 'fs';
import { sql } from '../db/client.js';

const KEY = process.env.OPENAI_API_KEY;
const IN = '/private/tmp/claude-501/-Users-bobs-Desktop-bobs-project-jchsanGi/baba59d8-18dc-4777-a5af-e9513498e479/scratchpad/compare100.json';
const SIM = 0.82, NEAR = 0.88;
const { results } = JSON.parse(fs.readFileSync(IN, 'utf8'));

const collect = (arm) => results.map((r, ai) => (r[arm].accepted ? { ai, cat: r.anchor.category, q: r[arm].accepted.question_text, e: r[arm].accepted.examples || '', a: r[arm].accepted.answer } : null)).filter(Boolean);
const gA = collect('A'), gB = collect('B');

async function embedBatch(texts) {
  const r = await fetch('https://api.openai.com/v1/embeddings', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` }, body: JSON.stringify({ model: 'text-embedding-3-small', input: texts }) });
  if (!r.ok) throw new Error(`embed ${r.status}`); return (await r.json()).data.map((d) => d.embedding);
}
async function embedAll(gs) { const v = []; for (let i = 0; i < gs.length; i += 96) v.push(...await embedBatch(gs.slice(i, i + 96).map((g) => `[${g.cat}] ${g.q}\n${g.e}`.slice(0, 6000)))); return v; }
const dot = (u, v) => { let s = 0; for (let i = 0; i < u.length; i += 1) s += u[i] * v[i]; return s; };

function analyze(gs, vecs) {
  let simPairs = 0, nearPairs = 0;
  const nn = new Array(gs.length).fill(0); // 각 문제의 최근접 유사도
  for (let i = 0; i < gs.length; i += 1) {
    for (let j = i + 1; j < gs.length; j += 1) {
      const s = dot(vecs[i], vecs[j]);
      if (s > nn[i]) nn[i] = s; if (s > nn[j]) nn[j] = s;
      if (s >= SIM) simPairs += 1; if (s >= NEAR) nearPairs += 1;
    }
  }
  const involved = nn.filter((s) => s >= NEAR).length; // 거의동일 짝이 있는 문제 수
  const avgNN = nn.reduce((a, b) => a + b, 0) / gs.length; // 평균 최근접 유사도 (내부 뭉침 정도)
  return { n: gs.length, simPairs, nearPairs, involved, avgNN };
}

console.log(`임베딩: A ${gA.length}개, B ${gB.length}개...`);
const [vA, vB] = [await embedAll(gA), await embedAll(gB)];
const a = analyze(gA, vA), b = analyze(gB, vB);

const pct = (x, n) => (n ? ((x / n) * 100).toFixed(0) : '0');
console.log('\n=== 내부 중복성 비교 (각 데이터셋 자기끼리) ===');
console.log(`                          방식 A(JSON식)   방식 B(RAG식)`);
console.log(`문제 수                     ${a.n}              ${b.n}`);
console.log(`유사쌍(≥${SIM})              ${a.simPairs}              ${b.simPairs}`);
console.log(`거의동일 쌍(≥${NEAR})        ${a.nearPairs}               ${b.nearPairs}`);
console.log(`거의동일 짝 있는 문제        ${a.involved} (${pct(a.involved, a.n)}%)         ${b.involved} (${pct(b.involved, b.n)}%)`);
console.log(`평균 최근접 유사도          ${a.avgNN.toFixed(3)}           ${b.avgNN.toFixed(3)}`);
console.log(`\n해석: 평균 최근접 유사도가 높을수록 = 데이터셋이 내부적으로 더 뭉쳐있음(중복 많음)`);
console.log(`→ ${b.avgNN > a.avgNN ? 'B(RAG)가 내부 중복 더 많음' : 'A(JSON)가 내부 중복 더 많음'} (차 ${Math.abs(b.avgNN - a.avgNN).toFixed(3)})`);
await sql.end();
