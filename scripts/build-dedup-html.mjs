import fs from 'fs';
const IN = '/private/tmp/claude-501/-Users-bobs-Desktop-bobs-project-jchsanGi/baba59d8-18dc-4777-a5af-e9513498e479/scratchpad/dedup.json';
const OUT = '/private/tmp/claude-501/-Users-bobs-Desktop-bobs-project-jchsanGi/baba59d8-18dc-4777-a5af-e9513498e479/scratchpad/dedup.html';
const D = JSON.parse(fs.readFileSync(IN, 'utf8'));
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const gside = (g) => `<div class="g">
  <div class="gh">${esc(g.cat)} · ${esc(g.src)}#${g.no} <span class="arm">${g.arm}</span></div>
  <div class="q">${esc(g.q)}</div>
  ${g.e ? `<pre>${esc(g.e)}</pre>` : ''}
  <div class="ans">정답: ${esc(g.a)}</div>
</div>`;
const simColor = (s) => (s >= D.thresholds.NEAR ? 'near' : 'sim');
const pairCards = D.crossPairs.map((p) => `
  <section class="pair">
    <div class="pair-h"><span class="score ${simColor(p.s)}">${(p.s * 100).toFixed(1)}% 유사</span>${p.s >= D.thresholds.NEAR ? '<span class="tag">거의 동일</span>' : ''}</div>
    <div class="two">${gside(p.gi)}${gside(p.gj)}</div>
  </section>`).join('');

const html = `<title>생성물 중복성 분석 — 100문제(A/B 184개)</title>
<style>
  :root{--paper:#FAFBFC;--surface:#fff;--ink:#19212E;--muted:#68717F;--faint:#9AA1AD;--border:#E5E9F0;--panel:#F2F5F9;
    --v:#6D4AC7;--v-soft:#EFE9FB;--near:#C0392F;--near-soft:#FBEAE6;--sim:#B7791F;--sim-soft:#FBF0DA;--good:#1F9D6B;
    --mono:ui-monospace,"SF Mono",Menlo,monospace;--sans:-apple-system,BlinkMacSystemFont,"Segoe UI","Pretendard","Apple SD Gothic Neo",sans-serif;}
  *{box-sizing:border-box;}body{margin:0;background:var(--paper);color:var(--ink);font-family:var(--sans);line-height:1.5;-webkit-font-smoothing:antialiased;}
  .wrap{max-width:1000px;margin:0 auto;padding:44px 24px 90px;}
  .eyebrow{font-family:var(--mono);font-size:11.5px;letter-spacing:.14em;text-transform:uppercase;color:var(--faint);margin:0 0 12px;}
  h1{font-size:clamp(22px,3.4vw,30px);letter-spacing:-.02em;margin:0 0 8px;font-weight:680;}
  .lede{font-size:14.5px;color:var(--muted);max-width:66ch;margin:0 0 20px;}
  .stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:1px;background:var(--border);border:1px solid var(--border);border-radius:12px;overflow:hidden;margin-bottom:16px;}
  .st{background:var(--surface);padding:15px 16px;} .st .v{font-size:22px;font-weight:700;font-variant-numeric:tabular-nums;} .st .l{font-size:12px;color:var(--muted);margin-top:2px;}
  .st .v.n{color:var(--near);} .st .v.s{color:var(--sim);}
  .note{font-size:12.5px;color:var(--muted);background:var(--panel);border-radius:8px;padding:12px 15px;margin-bottom:26px;}
  h2{font-size:12px;font-family:var(--mono);letter-spacing:.1em;text-transform:uppercase;color:var(--faint);margin:26px 0 12px;font-weight:600;}
  .pair{border:1px solid var(--border);border-radius:14px;background:var(--surface);padding:16px;margin-bottom:14px;}
  .pair-h{display:flex;gap:8px;align-items:center;margin-bottom:12px;}
  .score{font-family:var(--mono);font-size:13px;font-weight:700;padding:4px 11px;border-radius:8px;}
  .score.near{background:var(--near-soft);color:var(--near);} .score.sim{background:var(--sim-soft);color:var(--sim);}
  .tag{font-family:var(--mono);font-size:10.5px;font-weight:700;padding:3px 8px;border-radius:6px;background:var(--near);color:#fff;}
  .two{display:grid;grid-template-columns:1fr 1fr;gap:12px;}@media(max-width:720px){.two{grid-template-columns:1fr}}
  .g{border:1px solid var(--border);border-radius:10px;padding:13px;background:var(--panel);}
  .gh{font-family:var(--mono);font-size:11.5px;color:var(--muted);margin-bottom:8px;} .arm{background:var(--v-soft);color:var(--v);padding:1px 6px;border-radius:4px;font-weight:600;}
  .q{font-size:13.5px;white-space:pre-wrap;margin-bottom:7px;} .ans{font-family:var(--mono);font-size:12.5px;font-weight:600;color:var(--good);}
  pre{font-family:var(--mono);font-size:11.5px;white-space:pre-wrap;background:#fff;border:1px solid var(--border);border-radius:6px;padding:8px 10px;margin:0 0 7px;overflow-x:auto;}
</style>
<div class="wrap">
  <p class="eyebrow">AI Quality Lab · 의미적 중복성 분석</p>
  <h1>생성물끼리 얼마나 겹치나</h1>
  <p class="lede">100개 원본으로 만든 생성물 <b>${D.total}개</b>(A·B 합)를 임베딩해서 서로 얼마나 비슷한지 계산. 유사도 ${(D.thresholds.SIM * 100).toFixed(0)}%↑를 "유사", ${(D.thresholds.NEAR * 100).toFixed(0)}%↑를 "거의 동일"로 봄.</p>
  <div class="stats">
    <div class="st"><div class="v">${D.total}</div><div class="l">채택 생성물</div></div>
    <div class="st"><div class="v s">${D.sameAnchor}</div><div class="l">같은 원본 A↔B (기대됨)</div></div>
    <div class="st"><div class="v n">${D.cross}</div><div class="l">다른 원본끼리 유사 (진짜 중복)</div></div>
    <div class="st"><div class="v n">${D.crossNear}</div><div class="l">거의 동일 (교차)</div></div>
    <div class="st"><div class="v n">${D.bankDup}</div><div class="l">기출과 거의 동일 (복제)</div></div>
  </div>
  <div class="note"><b>어떻게 읽나:</b> "같은 원본 A↔B"(${D.sameAnchor})는 같은 문제의 두 변형이라 비슷한 게 <b>정상</b>. 문제는 <b style="color:var(--near)">"다른 원본끼리 유사"(${D.cross})</b> — 서로 다른 기출에서 만들었는데 결과가 겹치는 것. 이게 배포 시 <b>중복 제거로 걸러야 할 대상</b>이에요. 아래는 그 교차 유사 쌍들.</div>

  <h2>다른 원본끼리 유사한 쌍 — ${D.crossPairs.length}건</h2>
  ${pairCards || '<p style="color:var(--faint)">없음</p>'}
</div>`;
fs.writeFileSync(OUT, html);
console.log('중복성 HTML:', OUT);
