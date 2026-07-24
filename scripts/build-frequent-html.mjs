import fs from 'fs';
const IN = '/private/tmp/claude-501/-Users-bobs-Desktop-bobs-project-jchsanGi/baba59d8-18dc-4777-a5af-e9513498e479/scratchpad/frequent.json';
const OUT = '/private/tmp/claude-501/-Users-bobs-Desktop-bobs-project-jchsanGi/baba59d8-18dc-4777-a5af-e9513498e479/scratchpad/frequent.html';
const D = JSON.parse(fs.readFileSync(IN, 'utf8'));
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const fmtRound = (r) => `${r.slice(0, 4)}.${r.slice(4, 6)}.${r.slice(6, 8)}`;
const norm = (s) => String(s || '').replace(/\s+/g, '');

const cross = D.clusters.filter((c) => c.rounds >= 2).sort((a, b) => b.rounds - a.rounds || b.size - a.size);

const BASE = 'http://localhost:3000';
const itemHtml = (it) => `
  <div class="ver">
    <a class="vr" href="${BASE}/test/pdf-pack/network2-${it.round}/quiz" target="_blank" rel="noopener">${fmtRound(it.round)} · ${it.no}번 ↗</a>
    <div class="q">${esc(it.q)}</div>
    ${it.opts && it.opts.length ? `<ol class="opts">${it.opts.map((o) => `<li>${esc(o)}</li>`).join('')}</ol>` : ''}
  </div>`;

const cards = cross.map((c) => {
  const allSame = new Set(c.items.map((it) => norm(it.q))).size === 1;
  return `<section class="card">
    <div class="ch">
      <span class="cnt">${c.rounds}개 회차 · ${c.size}회</span>
      <span class="kind ${allSame ? 'same' : 'var'}">${allSame ? '완전 동일 문구' : '변형(말 바꿈)'}</span>
    </div>
    <div class="vers">${c.items.map(itemHtml).join('')}</div>
  </section>`;
}).join('');

const sameCount = cross.filter((c) => new Set(c.items.map((it) => norm(it.q))).size === 1).length;

const html = `<title>빈출 문제 — 회차별 실제 형태 비교</title>
<style>
  :root{--paper:#FAFBFC;--surface:#fff;--ink:#19212E;--muted:#68717F;--faint:#9AA1AD;--border:#E5E9F0;--panel:#F2F5F9;
    --v:#4457C7;--v-soft:#EEEFFB;--hot:#C0392F;--hot-soft:#FBEAE6;--same:#1F9D6B;--same-soft:#E4F5EC;--var:#B7791F;--var-soft:#FBF0DA;
    --mono:ui-monospace,"SF Mono",Menlo,monospace;--sans:-apple-system,BlinkMacSystemFont,"Segoe UI","Pretendard","Apple SD Gothic Neo",sans-serif;}
  *{box-sizing:border-box;}body{margin:0;background:var(--paper);color:var(--ink);font-family:var(--sans);line-height:1.5;-webkit-font-smoothing:antialiased;}
  .wrap{max-width:920px;margin:0 auto;padding:44px 24px 80px;}
  .eyebrow{font-family:var(--mono);font-size:11.5px;letter-spacing:.14em;text-transform:uppercase;color:var(--faint);margin:0 0 12px;}
  h1{font-size:clamp(22px,3.4vw,30px);letter-spacing:-.02em;margin:0 0 8px;font-weight:680;}
  .lede{font-size:14.5px;color:var(--muted);max-width:66ch;margin:0 0 18px;} .lede b{color:var(--ink);}
  .stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:1px;background:var(--border);border:1px solid var(--border);border-radius:12px;overflow:hidden;margin-bottom:16px;}
  .st{background:var(--surface);padding:14px 16px;} .st .v{font-size:22px;font-weight:700;font-variant-numeric:tabular-nums;} .st .v.h{color:var(--hot);} .st .v.g{color:var(--same);} .st .v.y{color:var(--var);} .st .l{font-size:12px;color:var(--muted);margin-top:2px;}
  .note{font-size:12.5px;color:var(--muted);background:var(--panel);border-radius:8px;padding:12px 15px;margin-bottom:26px;}
  h2{font-size:12px;font-family:var(--mono);letter-spacing:.1em;text-transform:uppercase;color:var(--faint);margin:26px 0 12px;font-weight:600;}
  .card{border:1px solid var(--border);border-radius:14px;background:var(--surface);padding:16px 18px;margin-bottom:14px;}
  .ch{display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap;}
  .cnt{font-family:var(--mono);font-size:11px;font-weight:700;padding:3px 9px;border-radius:6px;background:var(--hot-soft);color:var(--hot);}
  .kind{font-family:var(--mono);font-size:11px;font-weight:700;padding:3px 9px;border-radius:6px;} .kind.same{background:var(--same-soft);color:var(--same);} .kind.var{background:var(--var-soft);color:var(--var);}
  .vers{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px;}
  .ver{border:1px solid var(--border);border-radius:10px;background:var(--panel);padding:12px 14px;}
  .vr{font-family:var(--mono);font-size:11px;font-weight:700;color:var(--v);background:var(--v-soft);display:inline-block;padding:3px 9px;border-radius:5px;margin-bottom:8px;text-decoration:none;cursor:pointer;border:1px solid transparent;}
  .vr:hover{border-color:var(--v);background:#fff;}
  .q{font-size:13.5px;white-space:pre-wrap;margin-bottom:8px;}
  .opts{margin:0;padding-left:18px;} .opts li{font-size:12px;color:var(--muted);margin-bottom:2px;}
</style>
<div class="wrap">
  <p class="eyebrow">RAG · 빈출 문제 회차별 원문 비교 · 네트워크2 필기</p>
  <h1>같은 문제, 회차마다 어떻게 나왔나</h1>
  <p class="lede">임베딩이 "같은 문제"로 묶은 클러스터를, <b>각 회차의 실제 원문·보기를 나란히</b> 펼쳤어요. <span style="color:var(--same);font-weight:600">초록=완전 동일 문구</span>, <span style="color:var(--var);font-weight:600">노랑=말만 바꾼 변형</span>.</p>
  <div class="stats">
    <div class="st"><div class="v">${cross.length}</div><div class="l">여러 회차 반복 유형</div></div>
    <div class="st"><div class="v g">${sameCount}</div><div class="l">완전 동일 문구</div></div>
    <div class="st"><div class="v y">${cross.length - sameCount}</div><div class="l">변형(말 바꿈)</div></div>
    <div class="st"><div class="v h">${(D.inCluster / D.total * 100).toFixed(0)}%</div><div class="l">전체 반복 비율</div></div>
  </div>
  <div class="note"><b>직접 확인:</b> 각 회차 뱃지(예: <span style="font-family:var(--mono);color:var(--v)">2024.05.19 · 21번 ↗</span>)를 <b>누르면 실제 앱의 그 회차 시험이 새 탭으로 열려요</b> (로컬 서버 localhost:3000 실행 중일 때). 거기서 해당 번호 문제를 찾아 대조하시면 됩니다. · <b>완전 동일</b>=글자까지 재출제(단어매칭도 잡음), <b>변형</b>=말만 바꿈(<b>임베딩만 잡음</b>).</div>
  <h2>반복 유형 ${cross.length}개 — 회차별 원문</h2>
  ${cards}
</div>`;
fs.writeFileSync(OUT, html);
console.log('회차별 비교 HTML:', OUT, `| 완전동일 ${sameCount} / 변형 ${cross.length - sameCount}`);
