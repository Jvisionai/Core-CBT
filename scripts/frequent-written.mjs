import 'dotenv/config';
import fs from 'fs';
import path from 'path';

const KEY = process.env.OPENAI_API_KEY;
const PK = '/Users/bobs/Desktop/bobs_project/jchsanGi/datasets/pdfPacks';
const TH = 0.86;      // 이 이상이면 "사실상 같은/반복 문제"
const OUTJSON = '/private/tmp/claude-501/-Users-bobs-Desktop-bobs-project-jchsanGi/baba59d8-18dc-4777-a5af-e9513498e479/scratchpad/frequent.json';
const stripBom = (s) => String(s || '').replace(/^﻿/, '');

// 네트워크2 필기 문제 로드 (회차별)
const slugs = fs.readdirSync(PK).filter((d) => d.startsWith('network2-')).sort();
const probs = [];
for (const slug of slugs) {
  try {
    const data = JSON.parse(stripBom(fs.readFileSync(path.join(PK, slug, 'problem1.json'), 'utf8')));
    const round = slug.replace('network2-', '');
    data.flatMap((s) => s.problems || []).forEach((p) => probs.push({ round, no: p.problem_number, q: p.question_text, opts: p.options || [] }));
  } catch (e) { /* skip */ }
}
console.log(`네트워크2 필기 ${probs.length}문제 (${slugs.length}회차) 임베딩 중...`);

async function embedBatch(texts) {
  const r = await fetch('https://api.openai.com/v1/embeddings', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` }, body: JSON.stringify({ model: 'text-embedding-3-small', input: texts }) });
  if (!r.ok) throw new Error(`embed ${r.status}: ${await r.text()}`); return (await r.json()).data.map((d) => d.embedding);
}
const vecs = [];
for (let i = 0; i < probs.length; i += 96) vecs.push(...await embedBatch(probs.slice(i, i + 96).map((p) => `${p.q}\n${p.opts.join(' / ')}`.slice(0, 4000))));
const dot = (u, v) => { let s = 0; for (let i = 0; i < u.length; i += 1) s += u[i] * v[i]; return s; };

// Union-Find로 클러스터링 (유사도 ≥ TH끼리 묶음)
const n = probs.length;
const parent = [...Array(n).keys()];
const find = (x) => (parent[x] === x ? x : (parent[x] = find(parent[x])));
const union = (a, b) => { parent[find(a)] = find(b); };
let edges = 0;
for (let i = 0; i < n; i += 1) for (let j = i + 1; j < n; j += 1) if (dot(vecs[i], vecs[j]) >= TH) { union(i, j); edges += 1; }

const groups = {};
for (let i = 0; i < n; i += 1) { const r = find(i); (groups[r] = groups[r] || []).push(i); }
const clusters = Object.values(groups).filter((g) => g.length >= 2)
  .map((g) => ({ items: g, size: g.length, rounds: new Set(g.map((i) => probs[i].round)).size }))
  .sort((a, b) => b.rounds - a.rounds || b.size - a.size);

const inCluster = clusters.reduce((a, c) => a + c.size, 0);
console.log(`\n=== 반복 유형 분석 (유사도 ≥ ${TH}) ===`);
console.log(`반복 클러스터: ${clusters.length}개 | 반복에 속한 문제: ${inCluster}/${n} (${(inCluster / n * 100).toFixed(0)}%)`);
console.log(`\n=== 여러 회차에 걸친 빈출 유형 top 12 ===`);
clusters.slice(0, 12).forEach((c, i) => {
  const ex = probs[c.items[0]];
  const rounds = [...new Set(c.items.map((x) => probs[x].round))].sort();
  console.log(`\n${i + 1}. [${c.size}회 반복, ${c.rounds}개 회차] ${ex.q.slice(0, 50)}`);
  console.log(`   회차: ${rounds.join(', ')}`);
});

fs.writeFileSync(OUTJSON, JSON.stringify({
  total: n, rounds: slugs.length, threshold: TH, clusterCount: clusters.length, inCluster,
  clusters: clusters.slice(0, 40).map((c) => ({ size: c.size, rounds: c.rounds, items: c.items.map((i) => ({ round: probs[i].round, no: probs[i].no, q: probs[i].q, opts: probs[i].opts })) })),
}, null, 2));
console.log('\n저장:', OUTJSON);
