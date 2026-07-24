import 'dotenv/config';
import fs from 'fs';
import path from 'path';

const KEY = process.env.OPENAI_API_KEY;
const DS = '/Users/bobs/Desktop/bobs_project/jchsanGi/datasets';
const BASE = 'http://localhost:3000';
const TH = 0.86;
const OUTJSON = '/private/tmp/claude-501/-Users-bobs-Desktop-bobs-project-jchsanGi/baba59d8-18dc-4777-a5af-e9513498e479/scratchpad/frequent-gichul.json';
const stripBom = (s) => String(s || '').replace(/^﻿/, '');

// 정보처리산업기사 필기 9회차 (세션ID = 앱 링크용)
const ROUNDS = [
  { dir: ['problem2024', 'first'], label: '2024-1', sid: '1' },
  { dir: ['problem2024', 'second'], label: '2024-2', sid: '2' },
  { dir: ['problem2024', 'third'], label: '2024-3', sid: '3' },
  { dir: ['problem2023', 'first'], label: '2023-1', sid: '6' },
  { dir: ['problem2023', 'second'], label: '2023-2', sid: '7' },
  { dir: ['problem2023', 'third'], label: '2023-3', sid: '8' },
  { dir: ['problem2022', 'first'], label: '2022-1', sid: '9' },
  { dir: ['problem2022', 'second'], label: '2022-2', sid: '10' },
  { dir: ['problem2022', 'third'], label: '2022-3', sid: '11' },
];

const probs = [];
for (const r of ROUNDS) {
  const f = path.join(DS, ...r.dir, 'problem1.json');
  if (!fs.existsSync(f)) { console.warn('없음:', r.label); continue; }
  const data = JSON.parse(stripBom(fs.readFileSync(f, 'utf8')));
  data.flatMap((s) => s.problems || []).forEach((p) => probs.push({ round: r.label, no: p.problem_number, q: p.question_text, opts: p.options || [], link: `${BASE}/test/${r.sid}` }));
}
console.log(`정보처리산업기사 필기 ${probs.length}문제 (${ROUNDS.length}회차) 임베딩 중...`);

async function embedBatch(texts) {
  let last;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const r = await fetch('https://api.openai.com/v1/embeddings', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` }, body: JSON.stringify({ model: 'text-embedding-3-small', input: texts }), signal: AbortSignal.timeout(120000) });
      if (!r.ok) throw new Error(`embed ${r.status}`);
      return (await r.json()).data.map((d) => d.embedding);
    } catch (e) { last = e; await new Promise((rs) => setTimeout(rs, 2000 * (attempt + 1))); }
  }
  throw last;
}
const vecs = [];
for (let i = 0; i < probs.length; i += 96) vecs.push(...await embedBatch(probs.slice(i, i + 96).map((p) => `${p.q}\n${p.opts.join(' / ')}`.slice(0, 4000))));
const dot = (u, v) => { let s = 0; for (let i = 0; i < u.length; i += 1) s += u[i] * v[i]; return s; };

const n = probs.length;
const parent = [...Array(n).keys()];
const find = (x) => (parent[x] === x ? x : (parent[x] = find(parent[x])));
const union = (a, b) => { parent[find(a)] = find(b); };
for (let i = 0; i < n; i += 1) for (let j = i + 1; j < n; j += 1) if (dot(vecs[i], vecs[j]) >= TH) union(i, j);

const groups = {};
for (let i = 0; i < n; i += 1) { const r = find(i); (groups[r] = groups[r] || []).push(i); }
const clusters = Object.values(groups).filter((g) => g.length >= 2)
  .map((g) => ({ size: g.length, rounds: new Set(g.map((i) => probs[i].round)).size, items: g.map((i) => probs[i]) }))
  .sort((a, b) => b.rounds - a.rounds || b.size - a.size);
const inCluster = clusters.reduce((a, c) => a + c.size, 0);
const cross = clusters.filter((c) => c.rounds >= 2);

console.log(`\n반복 클러스터 ${clusters.length} | 반복 문제 ${inCluster}/${n} (${(inCluster / n * 100).toFixed(0)}%) | 여러회차 반복 ${cross.length}`);
cross.slice(0, 10).forEach((c, i) => console.log(`${i + 1}. [${c.rounds}회차] ${c.items[0].q.slice(0, 46)} — ${[...new Set(c.items.map((x) => x.round))].join(', ')}`));

fs.writeFileSync(OUTJSON, JSON.stringify({ total: n, rounds: ROUNDS.length, threshold: TH, clusterCount: clusters.length, inCluster, clusters: clusters.slice(0, 60) }, null, 2));
console.log('\n저장:', OUTJSON);
