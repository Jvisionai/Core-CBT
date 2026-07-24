import fs from 'fs';
const IN = process.argv[2] || '/private/tmp/claude-501/-Users-bobs-Desktop-bobs-project-jchsanGi/baba59d8-18dc-4777-a5af-e9513498e479/scratchpad/compare-results.json';
const OUT = process.argv[3] || '/private/tmp/claude-501/-Users-bobs-Desktop-bobs-project-jchsanGi/baba59d8-18dc-4777-a5af-e9513498e479/scratchpad/compare.html';
const { summary, results } = JSON.parse(fs.readFileSync(IN, 'utf8'));
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const flagsHtml = (f) => (f && f.length
  ? `<span class="flag bad">⚠ ${f.map(esc).join(', ')}</span>`
  : '<span class="flag ok">✓ 오류 없음</span>');

const armBlock = (arm, cls) => {
  if (!arm.accepted) return `<div class="arm ${cls}"><div class="arm-h">${cls === 'a' ? '방식 A · 본보기 1개' : '방식 B · 비슷한 기출 3개 참고'}</div><div class="rej">반려 (채택 실패)</div></div>`;
  const g = arm.accepted;
  return `<div class="arm ${cls}">
    <div class="arm-h">${cls === 'a' ? '방식 A · 본보기 1개' : '방식 B · 비슷한 기출 3개 참고'} ${flagsHtml(arm.flags)}</div>
    <div class="field"><span class="lb">문제</span><div class="q">${esc(g.question_text)}</div></div>
    ${g.examples ? `<div class="field"><span class="lb">보기/코드</span><pre>${esc(g.examples)}</pre></div>` : ''}
    <div class="field"><span class="lb">정답</span><div class="ans">${esc(g.answer)}</div></div>
    <div class="field"><span class="lb">해설</span><div class="cm">${esc(g.comment)}</div></div>
    <div class="meta">재생성 ${arm.regenerated ? 'O(다시 만듦)' : 'X(한번에)'}${arm.rag != null ? ` · 유형유사도 ${Number(arm.rag).toFixed(2)}` : ''}</div>
  </div>`;
};

const cards = results.map((r, i) => `
  <section class="card">
    <div class="card-h"><span class="idx">${i + 1}</span><span class="cat">${esc(r.anchor.category)}</span><span class="src">${esc(r.anchor.source)} #${r.anchor.no}</span></div>
    <div class="orig">
      <span class="lb">원본(본보기) 문제</span>
      <div class="q">${esc(r.anchor.question_text)}</div>
      <div class="ans">정답: ${esc(r.anchor.answer)}</div>
    </div>
    <div class="arms">${armBlock(r.A, 'a')}${armBlock(r.B, 'b')}</div>
  </section>`).join('');

const html = `<title>생성 방식 비교 — JSON식(A) vs DB·RAG식(B)</title>
<style>
  :root{--paper:#FAFBFC;--surface:#fff;--ink:#19212E;--muted:#68717F;--faint:#9AA1AD;--border:#E5E9F0;--panel:#F2F5F9;
    --a:#C77A2E;--a-soft:#FBF1E4;--b:#0E8C7F;--b-soft:#E5F4F1;--bad:#C0392F;--bad-soft:#FBEAE6;--good:#1F9D6B;
    --mono:ui-monospace,"SF Mono","JetBrains Mono",Menlo,monospace;--sans:-apple-system,BlinkMacSystemFont,"Segoe UI","Pretendard","Apple SD Gothic Neo",sans-serif;}
  *{box-sizing:border-box;} body{margin:0;background:var(--paper);color:var(--ink);font-family:var(--sans);line-height:1.55;-webkit-font-smoothing:antialiased;}
  .wrap{max-width:1080px;margin:0 auto;padding:44px 24px 90px;}
  .eyebrow{font-family:var(--mono);font-size:11.5px;letter-spacing:.14em;text-transform:uppercase;color:var(--faint);margin:0 0 12px;}
  h1{font-size:clamp(22px,3.4vw,31px);line-height:1.15;letter-spacing:-.02em;margin:0 0 8px;font-weight:680;}
  .lede{font-size:15px;color:var(--muted);max-width:66ch;margin:0 0 24px;}
  .sum{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px;}
  .scard{border:1px solid var(--border);border-radius:12px;padding:16px 18px;background:var(--surface);}
  .scard.a{border-top:3px solid var(--a);} .scard.b{border-top:3px solid var(--b);}
  .scard .t{font-family:var(--mono);font-size:12px;font-weight:640;margin-bottom:8px;}
  .scard.a .t{color:var(--a);} .scard.b .t{color:var(--b);}
  .scard .row{display:flex;justify-content:space-between;font-size:13px;padding:3px 0;border-bottom:1px solid var(--border);}
  .scard .row:last-child{border:none;} .scard .v{font-family:var(--mono);font-weight:600;}
  .note{font-size:12.5px;color:var(--muted);background:var(--panel);border-radius:8px;padding:10px 13px;margin-bottom:30px;}
  .card{border:1px solid var(--border);border-radius:14px;background:var(--surface);padding:18px;margin-bottom:18px;}
  .card-h{display:flex;align-items:center;gap:10px;margin-bottom:12px;}
  .idx{font-family:var(--mono);font-weight:700;width:24px;height:24px;border-radius:6px;background:var(--ink);color:#fff;display:flex;align-items:center;justify-content:center;font-size:12px;}
  .cat{font-family:var(--mono);font-size:11px;background:var(--panel);padding:2px 8px;border-radius:5px;}
  .src{font-family:var(--mono);font-size:11px;color:var(--faint);}
  .orig{background:var(--panel);border-radius:10px;padding:12px 14px;margin-bottom:14px;}
  .lb{font-family:var(--mono);font-size:10.5px;letter-spacing:.06em;text-transform:uppercase;color:var(--faint);display:block;margin-bottom:4px;}
  .arms{display:grid;grid-template-columns:1fr 1fr;gap:14px;}
  @media(max-width:720px){.arms,.sum{grid-template-columns:1fr;}}
  .arm{border:1px solid var(--border);border-radius:11px;padding:14px;}
  .arm.a{background:var(--a-soft);border-color:#EAD6BC;} .arm.b{background:var(--b-soft);border-color:#BEE3DC;}
  .arm-h{font-family:var(--mono);font-size:12px;font-weight:640;margin-bottom:10px;display:flex;flex-wrap:wrap;gap:8px;align-items:center;}
  .arm.a .arm-h{color:var(--a);} .arm.b .arm-h{color:var(--b);}
  .flag{font-family:var(--mono);font-size:10.5px;font-weight:600;padding:2px 7px;border-radius:5px;}
  .flag.bad{background:var(--bad-soft);color:var(--bad);} .flag.ok{background:#E4F5EC;color:var(--good);}
  .field{margin-bottom:9px;}
  .q{font-size:14px;line-height:1.5;white-space:pre-wrap;}
  .ans{font-family:var(--mono);font-size:13px;font-weight:600;color:var(--ink);}
  .cm{font-size:12.5px;color:var(--muted);line-height:1.5;}
  pre{font-family:var(--mono);font-size:12px;line-height:1.5;white-space:pre-wrap;background:var(--surface);border:1px solid var(--border);border-radius:7px;padding:9px 11px;margin:0;overflow-x:auto;}
  .meta{font-family:var(--mono);font-size:11px;color:var(--faint);margin-top:8px;padding-top:7px;border-top:1px solid var(--border);}
  .rej{color:var(--bad);font-size:13px;font-weight:600;}
  .foot{margin-top:20px;font-size:12.5px;color:var(--faint);}
</style>
<div class="wrap">
  <p class="eyebrow">생성 품질 비교 · JSON식 vs DB·RAG식</p>
  <h1>같은 원본으로 두 방식이 만든 문제</h1>
  <p class="lede"><b>방식 A</b>는 원본 문제 1개만 보여주고 AI가 변형(=예전 JSON 방식). <b>방식 B</b>는 DB에서 비슷한 기출 3개를 찾아 함께 보여주고 만듦(=DB로 바꿔 가능해진 방식). 같은 원본 ${summary.n}개로 나란히 생성.</p>
  <div class="sum">
    <div class="scard a"><div class="t">방식 A · 본보기 1개 (예전)</div>
      <div class="row"><span>채택</span><span class="v">${summary.A.accepted}/${summary.n}</span></div>
      <div class="row"><span>재생성률</span><span class="v">${summary.A.regenRate}%</span></div>
      <div class="row"><span>오류율</span><span class="v" style="color:var(--bad)">${summary.A.errRate}%</span></div>
    </div>
    <div class="scard b"><div class="t">방식 B · 비슷한 기출 참고 (DB)</div>
      <div class="row"><span>채택</span><span class="v">${summary.B.accepted}/${summary.n}</span></div>
      <div class="row"><span>재생성률</span><span class="v">${summary.B.regenRate}%</span></div>
      <div class="row"><span>오류율</span><span class="v" style="color:var(--good)">${summary.B.errRate}%</span></div>
    </div>
  </div>
  <div class="note">⚠️ 표본 ${summary.n}개는 <b>방향성 확인용</b>이지 통계적 결론이 아닙니다. 아래에서 실제 만들어진 문제를 직접 비교해보세요 — <span style="color:var(--bad)">빨간 ⚠</span>가 오류 검출된 것.</div>
  ${cards}
  <div class="foot">오류 판정: 유형유사도(RAG) 낮거나, 해설↔정답 불일치, 정답 자체 오류 중 하나라도 걸리면 표시. 정답 오류는 LLM 판정이라 사람 확인 권장.</div>
</div>`;
fs.writeFileSync(OUT, html);
console.log('HTML 생성:', OUT);
