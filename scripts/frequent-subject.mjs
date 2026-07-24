import 'dotenv/config';
import fs from 'fs';
import path from 'path';

const KEY = process.env.OPENAI_API_KEY;
const DS = '/Users/bobs/Desktop/bobs_project/jchsanGi/datasets';
const BASE = 'http://localhost:3000';
const TH = 0.86;
const OUT = '/private/tmp/claude-501/-Users-bobs-Desktop-bobs-project-jchsanGi/baba59d8-18dc-4777-a5af-e9513498e479/scratchpad/frequent-subject.html';
const stripBom = (s) => String(s || '').replace(/^﻿/, '');
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const ROUNDS = [
  { dir: ['problem2024', 'first'], label: '2024-1', sid: '1' }, { dir: ['problem2024', 'second'], label: '2024-2', sid: '2' }, { dir: ['problem2024', 'third'], label: '2024-3', sid: '3' },
  { dir: ['problem2023', 'first'], label: '2023-1', sid: '6' }, { dir: ['problem2023', 'second'], label: '2023-2', sid: '7' }, { dir: ['problem2023', 'third'], label: '2023-3', sid: '8' },
  { dir: ['problem2022', 'first'], label: '2022-1', sid: '9' }, { dir: ['problem2022', 'second'], label: '2022-2', sid: '10' }, { dir: ['problem2022', 'third'], label: '2022-3', sid: '11' },
];
// 과목(섹션) 정규화 → 메타데이터
const normSubj = (t) => {
  const s = String(t).replace(/\s+/g, '').replace(/의/g, '');
  if (s.includes('정보시스템')) return '정보시스템 기반기술';
  if (s.includes('프로그래밍')) return '프로그래밍 언어 활용';
  if (s.includes('데이터베이스')) return '데이터베이스 활용';
  return t;
};

const probs = [];
for (const r of ROUNDS) {
  const f = path.join(DS, ...r.dir, 'problem1.json');
  if (!fs.existsSync(f)) continue;
  JSON.parse(stripBom(fs.readFileSync(f, 'utf8'))).forEach((sec) => {
    (sec.problems || []).forEach((p) => probs.push({ round: r.label, no: p.problem_number, q: p.question_text, opts: p.options || [], subject: normSubj(sec.title), link: `${BASE}/test/${r.sid}` }));
  });
}
console.log(`정보처리산업기사 필기 ${probs.length}문제 임베딩 중...`);

async function embedBatch(texts) {
  let last;
  for (let a = 0; a < 4; a += 1) { try { const r = await fetch('https://api.openai.com/v1/embeddings', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` }, body: JSON.stringify({ model: 'text-embedding-3-small', input: texts }), signal: AbortSignal.timeout(120000) }); if (!r.ok) throw new Error(`embed ${r.status}`); return (await r.json()).data.map((d) => d.embedding); } catch (e) { last = e; await new Promise((rs) => setTimeout(rs, 2000 * (a + 1))); } }
  throw last;
}
const vecs = [];
for (let i = 0; i < probs.length; i += 96) vecs.push(...await embedBatch(probs.slice(i, i + 96).map((p) => `${p.q}\n${p.opts.join(' / ')}`.slice(0, 4000))));
const dot = (u, v) => { let s = 0; for (let i = 0; i < u.length; i += 1) s += u[i] * v[i]; return s; };

// 과목(메타데이터)별로 나눠서, 그 안에서만 군집
const SUBJECTS = ['정보시스템 기반기술', '프로그래밍 언어 활용', '데이터베이스 활용'];
const bySubject = SUBJECTS.map((name) => {
  const idxs = probs.map((p, i) => (p.subject === name ? i : -1)).filter((i) => i >= 0);
  const pos = new Map(idxs.map((v, k) => [v, k]));
  const parent = idxs.map((_, k) => k);
  const find = (x) => (parent[x] === x ? x : (parent[x] = find(parent[x])));
  for (let a = 0; a < idxs.length; a += 1) for (let b = a + 1; b < idxs.length; b += 1) if (dot(vecs[idxs[a]], vecs[idxs[b]]) >= TH) parent[find(a)] = find(b);
  const groups = {};
  idxs.forEach((gi, k) => { const r = find(k); (groups[r] = groups[r] || []).push(gi); });
  const clusters = Object.values(groups).filter((g) => g.length >= 2)
    .map((g) => ({ size: g.length, rounds: new Set(g.map((i) => probs[i].round)).size, items: g.map((i) => probs[i]) }))
    .filter((c) => c.rounds >= 2).sort((a, b) => b.rounds - a.rounds || b.size - a.size);
  const inCluster = clusters.reduce((a, c) => a + c.size, 0);
  return { name, total: idxs.length, clusters, inCluster };
});

bySubject.forEach((s) => console.log(`\n[${s.name}] ${s.total}문제 · 여러회차 반복유형 ${s.clusters.length}개 · 반복문제 ${s.inCluster}`));

// HTML (과목별 섹션)
const norm = (s) => String(s || '').replace(/\s+/g, '');
const itemHtml = (it) => `<div class="ver"><a class="vr" href="${it.link}" target="_blank" rel="noopener">${it.round} · ${it.no}번 ↗</a><div class="q">${esc(it.q)}</div>${it.opts.length ? `<ol class="opts">${it.opts.map((o) => `<li>${esc(o)}</li>`).join('')}</ol>` : ''}</div>`;
const subjectHtml = (s) => {
  const same = s.clusters.filter((c) => new Set(c.items.map((it) => norm(it.q))).size === 1).length;
  const cards = s.clusters.map((c) => {
    const allSame = new Set(c.items.map((it) => norm(it.q))).size === 1;
    return `<section class="card"><div class="ch"><span class="cnt">${c.rounds}회차 · ${c.size}회</span><span class="kind ${allSame ? 'same' : 'var'}">${allSame ? '완전 동일' : '변형'}</span></div><div class="vers">${c.items.map(itemHtml).join('')}</div></section>`;
  }).join('');
  return `<div class="subj"><div class="subj-h"><span class="sn">${esc(s.name)}</span><span class="ss">${s.total}문제 · 반복유형 ${s.clusters.length}개 · 반복 ${(s.inCluster / s.total * 100).toFixed(0)}% · 동일 ${same}/변형 ${s.clusters.length - same}</span></div>${cards}</div>`;
};
const html = `<title>정보처리산업기사 필기 — 과목별 빈출</title>
<style>
  :root{--paper:#FAFBFC;--surface:#fff;--ink:#19212E;--muted:#68717F;--faint:#9AA1AD;--border:#E5E9F0;--panel:#F2F5F9;--v:#4457C7;--v-soft:#EEEFFB;--hot:#C0392F;--hot-soft:#FBEAE6;--same:#1F9D6B;--same-soft:#E4F5EC;--var:#B7791F;--var-soft:#FBF0DA;--mono:ui-monospace,"SF Mono",Menlo,monospace;--sans:-apple-system,BlinkMacSystemFont,"Segoe UI","Pretendard","Apple SD Gothic Neo",sans-serif;}
  *{box-sizing:border-box;}body{margin:0;background:var(--paper);color:var(--ink);font-family:var(--sans);line-height:1.5;-webkit-font-smoothing:antialiased;}
  .wrap{max-width:920px;margin:0 auto;padding:44px 24px 80px;}
  .eyebrow{font-family:var(--mono);font-size:11.5px;letter-spacing:.14em;text-transform:uppercase;color:var(--faint);margin:0 0 12px;}
  h1{font-size:clamp(22px,3.4vw,30px);letter-spacing:-.02em;margin:0 0 8px;font-weight:680;}
  .lede{font-size:14.5px;color:var(--muted);max-width:66ch;margin:0 0 24px;}.lede b{color:var(--ink);}
  .subj{margin-bottom:36px;}
  .subj-h{position:sticky;top:0;background:var(--paper);padding:12px 0 10px;border-bottom:2px solid var(--v);margin-bottom:14px;display:flex;flex-wrap:wrap;align-items:baseline;gap:10px;z-index:2;}
  .sn{font-size:18px;font-weight:700;color:var(--v);} .ss{font-family:var(--mono);font-size:12px;color:var(--muted);}
  .card{border:1px solid var(--border);border-radius:14px;background:var(--surface);padding:15px 17px;margin-bottom:12px;}
  .ch{display:flex;gap:8px;margin-bottom:11px;flex-wrap:wrap;}
  .cnt{font-family:var(--mono);font-size:11px;font-weight:700;padding:3px 9px;border-radius:6px;background:var(--hot-soft);color:var(--hot);}
  .kind{font-family:var(--mono);font-size:11px;font-weight:700;padding:3px 9px;border-radius:6px;}.kind.same{background:var(--same-soft);color:var(--same);}.kind.var{background:var(--var-soft);color:var(--var);}
  .vers{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px;}
  .ver{border:1px solid var(--border);border-radius:10px;background:var(--panel);padding:12px 14px;}
  .vr{font-family:var(--mono);font-size:11px;font-weight:700;color:var(--v);background:var(--v-soft);display:inline-block;padding:3px 9px;border-radius:5px;margin-bottom:8px;text-decoration:none;border:1px solid transparent;}.vr:hover{border-color:var(--v);background:#fff;}
  .q{font-size:13.5px;white-space:pre-wrap;margin-bottom:8px;} .opts{margin:0;padding-left:18px;}.opts li{font-size:12px;color:var(--muted);margin-bottom:2px;}
</style>
<div class="wrap">
  <p class="eyebrow">RAG · 과목별 빈출 · 정보처리산업기사 필기</p>
  <h1>과목 메타데이터로 나눈 빈출 문제</h1>
  <p class="lede">${probs.length}문제(9회차)에 <b>과목을 메타데이터로 붙이고</b>, 각 과목 <b>안에서만</b> 유사도 ${(TH * 100).toFixed(0)}%↑끼리 군집. 이제 네트워크 착시 없이 <b>과목별로 딱 나뉘어</b> 보여요. 회차 뱃지 누르면 실제 시험 열림.</p>
  ${bySubject.map(subjectHtml).join('')}
</div>`;
fs.writeFileSync(OUT, html);
console.log('\nHTML:', OUT);
