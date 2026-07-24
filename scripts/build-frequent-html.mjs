import fs from 'fs';
const IN = '/private/tmp/claude-501/-Users-bobs-Desktop-bobs-project-jchsanGi/baba59d8-18dc-4777-a5af-e9513498e479/scratchpad/frequent.json';
const OUT = '/private/tmp/claude-501/-Users-bobs-Desktop-bobs-project-jchsanGi/baba59d8-18dc-4777-a5af-e9513498e479/scratchpad/frequent.html';
const D = JSON.parse(fs.readFileSync(IN, 'utf8'));
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const fmtRound = (r) => `${r.slice(0, 4)}.${r.slice(4, 6)}`;

// 여러 회차에 걸친(빈출) 것 먼저
const cross = D.clusters.filter((c) => c.rounds >= 2).sort((a, b) => b.rounds - a.rounds || b.size - a.size);
const cards = cross.map((c, i) => {
  const rep = c.items[0];
  const rounds = c.items.map((it) => `<span class="rnd">${fmtRound(it.round)} #${it.no}</span>`).join('');
  return `<section class="card">
    <div class="ch"><span class="cnt">${c.rounds}개 회차</span><span class="sz">${c.size}회 출제</span></div>
    <div class="q">${esc(rep.q)}</div>
    ${rep.opts && rep.opts.length ? `<div class="opts">${rep.opts.map((o) => `<span class="o">${esc(o)}</span>`).join('')}</div>` : ''}
    <div class="rounds">출제 회차: ${rounds}</div>
  </section>`;
}).join('');

const html = `<title>빈출 문제 자동 탐지 — 네트워크2 필기 10회차</title>
<style>
  :root{--paper:#FAFBFC;--surface:#fff;--ink:#19212E;--muted:#68717F;--faint:#9AA1AD;--border:#E5E9F0;--panel:#F2F5F9;
    --v:#4457C7;--v-soft:#EEEFFB;--hot:#C0392F;--hot-soft:#FBEAE6;--good:#1F9D6B;
    --mono:ui-monospace,"SF Mono",Menlo,monospace;--sans:-apple-system,BlinkMacSystemFont,"Segoe UI","Pretendard","Apple SD Gothic Neo",sans-serif;}
  *{box-sizing:border-box;}body{margin:0;background:var(--paper);color:var(--ink);font-family:var(--sans);line-height:1.5;-webkit-font-smoothing:antialiased;}
  .wrap{max-width:860px;margin:0 auto;padding:44px 24px 80px;}
  .eyebrow{font-family:var(--mono);font-size:11.5px;letter-spacing:.14em;text-transform:uppercase;color:var(--faint);margin:0 0 12px;}
  h1{font-size:clamp(22px,3.4vw,30px);letter-spacing:-.02em;margin:0 0 8px;font-weight:680;}
  .lede{font-size:14.5px;color:var(--muted);max-width:64ch;margin:0 0 20px;}
  .lede b{color:var(--ink);}
  .stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:1px;background:var(--border);border:1px solid var(--border);border-radius:12px;overflow:hidden;margin-bottom:16px;}
  .st{background:var(--surface);padding:15px 16px;} .st .v{font-size:24px;font-weight:700;font-variant-numeric:tabular-nums;} .st .v.h{color:var(--hot);} .st .l{font-size:12px;color:var(--muted);margin-top:2px;}
  .note{font-size:12.5px;color:var(--muted);background:var(--panel);border-radius:8px;padding:12px 15px;margin-bottom:26px;}
  h2{font-size:12px;font-family:var(--mono);letter-spacing:.1em;text-transform:uppercase;color:var(--faint);margin:26px 0 12px;font-weight:600;}
  .card{border:1px solid var(--border);border-radius:14px;background:var(--surface);padding:16px 18px;margin-bottom:12px;}
  .ch{display:flex;gap:8px;margin-bottom:10px;}
  .cnt{font-family:var(--mono);font-size:11px;font-weight:700;padding:3px 9px;border-radius:6px;background:var(--hot-soft);color:var(--hot);}
  .sz{font-family:var(--mono);font-size:11px;font-weight:600;padding:3px 9px;border-radius:6px;background:var(--v-soft);color:var(--v);}
  .q{font-size:14.5px;font-weight:560;margin-bottom:9px;white-space:pre-wrap;}
  .opts{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px;}
  .o{font-size:12px;padding:2px 8px;border-radius:5px;background:var(--panel);border:1px solid var(--border);color:var(--muted);}
  .rounds{font-size:12px;color:var(--muted);font-family:var(--mono);}
  .rnd{display:inline-block;background:var(--v-soft);color:var(--v);padding:1px 7px;border-radius:5px;margin:0 4px 4px 0;font-size:11px;}
</style>
<div class="wrap">
  <p class="eyebrow">RAG · 빈출 문제 자동 탐지 · 네트워크관리사 2급 필기</p>
  <h1>자주 나오는 문제, 임베딩이 자동으로 찾음</h1>
  <p class="lede">10회차 <b>${D.total}문제</b>를 임베딩해서 유사도 ${(D.threshold * 100).toFixed(0)}%↑끼리 자동 묶음. <b>사람이 "이거랑 이거 같다"를 태깅할 필요 없이</b>, 반복 출제 유형이 그대로 드러남.</p>
  <div class="stats">
    <div class="st"><div class="v">${D.total}</div><div class="l">필기 문제 (10회차)</div></div>
    <div class="st"><div class="v h">${(D.inCluster / D.total * 100).toFixed(0)}%</div><div class="l">반복 콘텐츠 (${D.inCluster}문제)</div></div>
    <div class="st"><div class="v">${cross.length}</div><div class="l">여러 회차 반복 유형</div></div>
    <div class="st"><div class="v">${cross[0]?.rounds || 0}</div><div class="l">최다 반복 회차 수</div></div>
  </div>
  <div class="note"><b>왜 중요:</b> 필기 문제의 <b style="color:var(--hot)">${(D.inCluster / D.total * 100).toFixed(0)}%가 반복</b> — 시험이 기출을 다시 낸다는 뜻. 즉 <b>이 빈출 유형만 잘 봐도 점수가 크게 오름.</b> JSON으로 하면 사람이 500문제를 눈으로 비교해 태깅해야 하지만, 임베딩은 자동. 아래는 <b>여러 회차에 걸쳐 반복된 유형</b>(진짜 빈출).</div>
  <h2>여러 회차 반복 유형 — ${cross.length}개</h2>
  ${cards}
</div>`;
fs.writeFileSync(OUT, html);
console.log('빈출 HTML:', OUT, '| 여러회차 클러스터', cross.length);
