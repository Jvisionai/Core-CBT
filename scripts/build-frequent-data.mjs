import 'dotenv/config';
import fs from 'fs';
import path from 'path';

const KEY = process.env.OPENAI_API_KEY;
const SUPA = process.env.SUPABASE_URL;
const SKEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const OUT_TABLE = process.env.SUPABASE_PROBLEM_OUTCOMES_TABLE || 'problem_outcomes';
const DS = path.resolve(process.cwd(), 'datasets');
const OUT = path.resolve(process.cwd(), 'app/frequent/_data/frequent.json');
const TH = 0.86, MIN_ATTEMPTS = 20;
const stripBom = (s) => String(s || '').replace(/^﻿/, '');

const ROUNDS = [
  { dir: ['problem2024', 'first'], label: '2024-1', sid: '1' }, { dir: ['problem2024', 'second'], label: '2024-2', sid: '2' }, { dir: ['problem2024', 'third'], label: '2024-3', sid: '3' },
  { dir: ['problem2023', 'first'], label: '2023-1', sid: '6' }, { dir: ['problem2023', 'second'], label: '2023-2', sid: '7' }, { dir: ['problem2023', 'third'], label: '2023-3', sid: '8' },
  { dir: ['problem2022', 'first'], label: '2022-1', sid: '9' }, { dir: ['problem2022', 'second'], label: '2022-2', sid: '10' }, { dir: ['problem2022', 'third'], label: '2022-3', sid: '11' },
];
const SUBJECTS = ['정보시스템 기반기술', '프로그래밍 언어 활용', '데이터베이스 활용'];
const normSubj = (t) => { const s = String(t).replace(/\s+/g, '').replace(/의/g, ''); if (s.includes('정보시스템')) return SUBJECTS[0]; if (s.includes('프로그래밍')) return SUBJECTS[1]; if (s.includes('데이터베이스')) return SUBJECTS[2]; return t; };

const probs = [];
for (const r of ROUNDS) {
  const f = path.join(DS, ...r.dir, 'problem1.json');
  if (!fs.existsSync(f)) continue;
  JSON.parse(stripBom(fs.readFileSync(f, 'utf8'))).forEach((sec) => (sec.problems || []).forEach((p) => probs.push({ round: r.label, sid: r.sid, no: p.problem_number, question: p.question_text, options: p.options || [], subject: normSubj(sec.title) })));
}
console.log(`문제 ${probs.length}개 임베딩 중...`);

async function embedBatch(texts) {
  let last; for (let a = 0; a < 4; a += 1) { try { const r = await fetch('https://api.openai.com/v1/embeddings', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` }, body: JSON.stringify({ model: 'text-embedding-3-small', input: texts }), signal: AbortSignal.timeout(120000) }); if (!r.ok) throw new Error(`embed ${r.status}`); return (await r.json()).data.map((d) => d.embedding); } catch (e) { last = e; await new Promise((rs) => setTimeout(rs, 2000 * (a + 1))); } } throw last;
}
const vecs = [];
for (let i = 0; i < probs.length; i += 96) vecs.push(...await embedBatch(probs.slice(i, i + 96).map((p) => `${p.question}\n${p.options.join(' / ')}`.slice(0, 4000))));
const dot = (u, v) => { let s = 0; for (let i = 0; i < u.length; i += 1) s += u[i] * v[i]; return s; };

// 오답률 집계 (페이지네이션)
const outcome = new Map();
if (SUPA && SKEY) {
  const sids = ROUNDS.map((r) => r.sid).join(',');
  for (let offset = 0; offset < 100000; offset += 1000) {
    const url = `${SUPA}/rest/v1/${OUT_TABLE}?select=source_session_id,source_problem_number,is_correct&source_session_id=in.(${sids})&offset=${offset}&limit=1000`;
    const res = await fetch(url, { headers: { apikey: SKEY, Authorization: `Bearer ${SKEY}` } });
    const rows = await res.json();
    if (!Array.isArray(rows) || rows.length === 0) break;
    rows.forEach((o) => { const k = `${o.source_session_id}:${o.source_problem_number}`; const e = outcome.get(k) || { attempts: 0, wrong: 0 }; e.attempts += 1; if (o.is_correct === false) e.wrong += 1; outcome.set(k, e); });
    if (rows.length < 1000) break;
  }
  console.log(`오답 집계: ${outcome.size}개 문제`);
}

const subjects = SUBJECTS.map((name) => {
  const idxs = probs.map((p, i) => (p.subject === name ? i : -1)).filter((i) => i >= 0);
  const parent = idxs.map((_, k) => k);
  const find = (x) => (parent[x] === x ? x : (parent[x] = find(parent[x])));
  for (let a = 0; a < idxs.length; a += 1) for (let b = a + 1; b < idxs.length; b += 1) if (dot(vecs[idxs[a]], vecs[idxs[b]]) >= TH) parent[find(a)] = find(b);
  const groups = {};
  idxs.forEach((gi, k) => { const rt = find(k); (groups[rt] = groups[rt] || []).push(gi); });
  const clusters = Object.values(groups).filter((g) => g.length >= 2)
    .map((g) => {
      const items = g.map((i) => probs[i]);
      const rounds = new Set(items.map((it) => it.round)).size;
      const kind = new Set(items.map((it) => it.question.replace(/\s+/g, ''))).size === 1 ? '동일' : '변형';
      let attempts = 0, wrong = 0;
      items.forEach((it) => { const e = outcome.get(`${it.sid}:${it.no}`); if (e) { attempts += e.attempts; wrong += e.wrong; } });
      const wrongRate = attempts >= MIN_ATTEMPTS ? Math.round((wrong / attempts) * 100) : null;
      return { rounds, size: items.length, kind, attempts, wrongRate, items };
    })
    .filter((c) => c.rounds >= 2)
    .sort((a, b) => (b.wrongRate ?? -1) * b.rounds - (a.wrongRate ?? -1) * a.rounds || b.rounds - a.rounds);
  const inCluster = clusters.reduce((s, c) => s + c.size, 0);
  return { name, total: idxs.length, repeatRate: Math.round((inCluster / idxs.length) * 100), clusters };
});

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify({ exam: '정보처리산업기사 필기', rounds: ROUNDS.length, subjects }, null, 2));
console.log('저장:', OUT);
console.log('과목별 클러스터:', subjects.map((s) => `${s.name} ${s.clusters.length}개(오답률 ${s.clusters.filter((c) => c.wrongRate != null).length})`).join(' · '));
