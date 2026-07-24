import 'dotenv/config';
import fs from 'fs';
import { sql } from '../db/client.js';

const KEY = process.env.OPENAI_API_KEY;
const IN = process.argv[2] || '/private/tmp/claude-501/-Users-bobs-Desktop-bobs-project-jchsanGi/baba59d8-18dc-4777-a5af-e9513498e479/scratchpad/compare100.json';
const OUTJSON = '/private/tmp/claude-501/-Users-bobs-Desktop-bobs-project-jchsanGi/baba59d8-18dc-4777-a5af-e9513498e479/scratchpad/dedup.json';
const NEAR = 0.88;   // 거의 동일
const SIM = 0.82;    // 매우 유사

const { results } = JSON.parse(fs.readFileSync(IN, 'utf8'));

// 채택된 생성 문제 수집
const gens = [];
results.forEach((r, ai) => {
  for (const arm of ['A', 'B']) {
    const g = r[arm].accepted;
    if (g) gens.push({ ai, arm, cat: r.anchor.category, src: r.anchor.source, no: r.anchor.no, q: g.question_text, e: g.examples || '', a: g.answer });
  }
});
console.log(`채택된 생성 문제 ${gens.length}개 임베딩 중...`);

async function embedBatch(texts) {
  const r = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` },
    body: JSON.stringify({ model: 'text-embedding-3-small', input: texts }),
  });
  if (!r.ok) throw new Error(`embed ${r.status}`);
  return (await r.json()).data.map((d) => d.embedding);
}
// 배치 임베딩
const vecs = [];
for (let i = 0; i < gens.length; i += 96) {
  const chunk = gens.slice(i, i + 96).map((g) => `[${g.cat}] ${g.q}\n${g.e}`.slice(0, 6000));
  vecs.push(...await embedBatch(chunk));
}
const dot = (u, v) => { let s = 0; for (let i = 0; i < u.length; i += 1) s += u[i] * v[i]; return s; }; // 정규화 벡터 → cosine

// 쌍별 유사도
const pairs = [];
for (let i = 0; i < gens.length; i += 1) {
  for (let j = i + 1; j < gens.length; j += 1) {
    const s = dot(vecs[i], vecs[j]);
    if (s >= SIM) pairs.push({ i, j, s, sameAnchor: gens[i].ai === gens[j].ai });
  }
}
pairs.sort((a, b) => b.s - a.s);

// 원본 기출과의 근접도 (각 생성물이 기존 문제 복제인가)
let bankDup = 0;
for (let i = 0; i < gens.length; i += 1) {
  const vec = `[${vecs[i].join(',')}]`;
  const rows = await sql`SELECT 1-(embedding <=> ${vec}::vector) AS sim FROM practical_problems WHERE embedding IS NOT NULL AND category=${gens[i].cat} ORDER BY embedding <=> ${vec}::vector LIMIT 1`;
  gens[i].bankSim = rows[0] ? Number(rows[0].sim) : 0;
  if (gens[i].bankSim >= NEAR) bankDup += 1;
}

const sameAnchorPairs = pairs.filter((p) => p.sameAnchor);
const crossPairs = pairs.filter((p) => !p.sameAnchor);
const crossNear = crossPairs.filter((p) => p.s >= NEAR);

console.log(`\n=== 생성물 간 중복성 (${gens.length}개, ${gens.length * (gens.length - 1) / 2}쌍 비교) ===`);
console.log(`유사(≥${SIM}) 쌍: ${pairs.length}`);
console.log(`  · 같은 원본의 A vs B (기대됨): ${sameAnchorPairs.length}`);
console.log(`  · 다른 원본끼리 유사 (진짜 중복): ${crossPairs.length}  (그중 거의동일 ≥${NEAR}: ${crossNear.length})`);
console.log(`\n원본 기출과 거의동일(≥${NEAR})한 생성물: ${bankDup}/${gens.length} (생성이 사실상 기출 복제)`);
console.log(`\n=== 다른 원본끼리 가장 유사한 쌍 top 8 ===`);
crossPairs.slice(0, 8).forEach((p) => console.log(`  ${p.s.toFixed(3)} | [${gens[p.i].cat}] ${gens[p.i].src}#${gens[p.i].no}(${gens[p.i].arm}) ↔ ${gens[p.j].src}#${gens[p.j].no}(${gens[p.j].arm})`));

fs.writeFileSync(OUTJSON, JSON.stringify({
  total: gens.length, thresholds: { SIM, NEAR },
  sameAnchor: sameAnchorPairs.length, cross: crossPairs.length, crossNear: crossNear.length, bankDup,
  gens: gens.map((g, i) => ({ ...g, idx: i })),
  crossPairs: crossPairs.map((p) => ({ ...p, gi: gens[p.i], gj: gens[p.j] })),
}, null, 2));
console.log('\n저장:', OUTJSON);
await sql.end();
