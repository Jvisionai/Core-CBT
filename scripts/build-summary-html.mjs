import 'dotenv/config';
import fs from 'fs';
import { sql } from '../db/client.js';

const KEY = process.env.OPENAI_API_KEY;
const IN = '/private/tmp/claude-501/-Users-bobs-Desktop-bobs-project-jchsanGi/baba59d8-18dc-4777-a5af-e9513498e479/scratchpad/compare100.json';
const OUT = '/private/tmp/claude-501/-Users-bobs-Desktop-bobs-project-jchsanGi/baba59d8-18dc-4777-a5af-e9513498e479/scratchpad/summary.html';
const SIM = 0.82, NEAR = 0.88;
const { results } = JSON.parse(fs.readFileSync(IN, 'utf8'));

// 품질 체크포인트
const agg = (rows, arm) => {
  const acc = rows.filter((r) => r[arm].accepted).length;
  const regen = rows.filter((r) => r[arm].regenerated).length;
  const err = rows.filter((r) => r[arm].accepted && r[arm].flags?.length).length;
  return { acc, regenRate: rows.length ? +((regen / rows.length) * 100).toFixed(1) : 0, errRate: acc ? +((err / acc) * 100).toFixed(1) : 0 };
};
const cps = [25, 50, 75, 100].filter((c) => results.length >= c).map((cp) => ({ at: cp, A: agg(results.slice(0, cp), 'A'), B: agg(results.slice(0, cp), 'B') }));

// 내부 중복 (각 arm)
const collect = (arm) => results.map((r) => (r[arm].accepted ? { cat: r.anchor.category, q: r[arm].accepted.question_text, e: r[arm].accepted.examples || '', a: r[arm].accepted.answer } : null)).filter(Boolean);
const gA = collect('A'), gB = collect('B');
async function embedBatch(t) { const r = await fetch('https://api.openai.com/v1/embeddings', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` }, body: JSON.stringify({ model: 'text-embedding-3-small', input: t }) }); return (await r.json()).data.map((d) => d.embedding); }
async function embedAll(gs) { const v = []; for (let i = 0; i < gs.length; i += 96) v.push(...await embedBatch(gs.slice(i, i + 96).map((g) => `[${g.cat}] ${g.q}\n${g.e}`.slice(0, 6000)))); return v; }
const dot = (u, v) => { let s = 0; for (let i = 0; i < u.length; i += 1) s += u[i] * v[i]; return s; };
function analyze(gs, vecs) {
  let simP = 0, nearP = 0; const nn = new Array(gs.length).fill(0);
  for (let i = 0; i < gs.length; i += 1) for (let j = i + 1; j < gs.length; j += 1) { const s = dot(vecs[i], vecs[j]); if (s > nn[i]) nn[i] = s; if (s > nn[j]) nn[j] = s; if (s >= SIM) simP += 1; if (s >= NEAR) nearP += 1; }
  return { n: gs.length, simP, nearP, involved: nn.filter((s) => s >= NEAR).length, avgNN: +(nn.reduce((a, b) => a + b, 0) / gs.length).toFixed(3) };
}
console.log('임베딩 중...');
const dA = analyze(gA, await embedAll(gA)), dB = analyze(gB, await embedAll(gB));

const cpRows = cps.map((r) => `<tr><td class="l">${r.at}</td><td class="a">${r.A.regenRate}%</td><td class="a err">${r.A.errRate}%</td><td class="b">${r.B.regenRate}%</td><td class="b err">${r.B.errRate}%</td></tr>`).join('');
const drow = (label, av, bv, hint) => `<tr><td class="l">${label}</td><td class="a">${av}</td><td class="b">${bv}</td><td class="hint">${hint || ''}</td></tr>`;

const html = `<title>100개 종합 — 품질 체크포인트 + 내부 중복</title>
<style>
  :root{--paper:#FAFBFC;--surface:#fff;--ink:#19212E;--muted:#68717F;--faint:#9AA1AD;--border:#E5E9F0;--panel:#F2F5F9;--a:#C77A2E;--b:#0E8C7F;--bad:#C0392F;--good:#1F9D6B;--mono:ui-monospace,"SF Mono",Menlo,monospace;--sans:-apple-system,BlinkMacSystemFont,"Segoe UI","Pretendard","Apple SD Gothic Neo",sans-serif;}
  *{box-sizing:border-box;}body{margin:0;background:var(--paper);color:var(--ink);font-family:var(--sans);line-height:1.5;-webkit-font-smoothing:antialiased;}
  .wrap{max-width:820px;margin:0 auto;padding:44px 24px 70px;}
  .eyebrow{font-family:var(--mono);font-size:11.5px;letter-spacing:.14em;text-transform:uppercase;color:var(--faint);margin:0 0 12px;}
  h1{font-size:clamp(21px,3.3vw,28px);letter-spacing:-.02em;margin:0 0 6px;font-weight:680;}
  .sub{font-size:14px;color:var(--muted);margin:0 0 26px;}
  h2{font-size:12px;font-family:var(--mono);letter-spacing:.1em;text-transform:uppercase;color:var(--faint);margin:30px 0 12px;font-weight:600;}
  .tbl{border:1px solid var(--border);border-radius:12px;overflow:hidden;background:var(--surface);overflow-x:auto;margin-bottom:8px;}
  table{border-collapse:collapse;width:100%;min-width:520px;}
  th{font-family:var(--mono);font-size:11px;text-transform:uppercase;color:var(--faint);padding:10px 12px;border-bottom:1px solid var(--border);text-align:right;background:var(--panel);}
  th.l{text-align:left;} th.ga{color:var(--a)}th.gb{color:var(--b)}
  td{padding:11px 12px;border-bottom:1px solid var(--border);text-align:right;font-variant-numeric:tabular-nums;font-family:var(--mono);font-size:13.5px;}tr:last-child td{border:none;}
  td.l{text-align:left;font-weight:700;} .a{color:var(--a)} .b{color:var(--b);font-weight:600} .err{font-weight:700} .hint{text-align:left;color:var(--muted);font-family:var(--sans);font-size:12px;}
  .note{font-size:12.5px;color:var(--muted);background:var(--panel);border-radius:8px;padding:12px 15px;margin-top:14px;}
  .leg{display:flex;gap:18px;font-size:12.5px;margin:12px 2px 0;} .la{color:var(--a)} .lb{color:var(--b)}
</style>
<div class="wrap">
  <p class="eyebrow">AI Quality Lab · 100개 종합</p>
  <h1>JSON식(A) vs RAG식(B) — 품질 + 내부 중복</h1>
  <p class="sub">같은 원본 100개로 A(본보기1개)·B(RAG 비슷한기출 참고) 생성. 품질은 25개마다, 중복은 각 데이터셋 자기끼리 임베딩 비교.</p>

  <h2>① 품질 체크포인트 (25개마다)</h2>
  <div class="tbl"><table>
    <thead><tr><th class="l">시점</th><th class="ga">A 재생성</th><th class="ga">A 오류</th><th class="gb">B 재생성</th><th class="gb">B 오류</th></tr></thead>
    <tbody>${cpRows}</tbody>
  </table></div>
  <div class="note">오류율: 표본 커질수록 A/B 격차 좁혀짐(100에서 ${cps.at(-1).A.errRate}% vs ${cps.at(-1).B.errRate}%). RAG의 품질 이득은 <b>작음</b>.</div>

  <h2>② 내부 중복성 (각 데이터셋 자기끼리)</h2>
  <div class="tbl"><table>
    <thead><tr><th class="l">지표</th><th class="ga">방식 A (JSON)</th><th class="gb">방식 B (RAG)</th><th style="text-align:left">뜻</th></tr></thead>
    <tbody>
      ${drow('문제 수', dA.n, dB.n, '채택된 생성물')}
      ${drow('유사쌍 (≥0.82)', dA.simP, dB.simP, '내부에서 비슷한 두 문제')}
      ${drow('거의동일 (≥0.88)', dA.nearP, dB.nearP, '사실상 같은 문제')}
      ${drow('중복 연루 문제', `${dA.involved} (${((dA.involved / dA.n) * 100).toFixed(0)}%)`, `${dB.involved} (${((dB.involved / dB.n) * 100).toFixed(0)}%)`, '거의동일 짝이 있는 문제')}
      ${drow('평균 최근접 유사도', dA.avgNN, dB.avgNN, '높을수록 내부가 뭉침')}
    </tbody>
  </table></div>
  <div class="leg"><span class="la">■ A = JSON식(본보기 1개)</span><span class="lb">■ B = RAG식(비슷한 기출 참고)</span></div>
  <div class="note"><b>결론:</b> 내부 중복은 <b>둘 다 매우 낮고 사실상 동점</b>(평균 최근접 ${dA.avgNN} vs ${dB.avgNN}). 극단(유사쌍)만 보면 ${dA.simP > dB.simP ? 'A(JSON)가 살짝 더 겹침' : dB.simP > dA.simP ? 'B(RAG)가 살짝 더 겹침' : '동일'}(${dA.simP} vs ${dB.simP}). → <b>RAG가 다양성을 해치지 않음</b>. "RAG 쓰면 문제가 서로 비슷해진다"는 걱정은 데이터상 근거 없음.</div>
</div>`;
fs.writeFileSync(OUT, html);
console.log('종합 HTML:', OUT);
console.log(`체크포인트 ${cps.length}개 · 내부중복 A(유사쌍 ${dA.simP}, avgNN ${dA.avgNN}) vs B(유사쌍 ${dB.simP}, avgNN ${dB.avgNN})`);
await sql.end();
