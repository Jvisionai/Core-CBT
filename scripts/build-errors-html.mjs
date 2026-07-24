import fs from 'fs';
const IN = process.argv[2] || '/private/tmp/claude-501/-Users-bobs-Desktop-bobs-project-jchsanGi/baba59d8-18dc-4777-a5af-e9513498e479/scratchpad/compare100.json';
const OUT = process.argv[3] || '/private/tmp/claude-501/-Users-bobs-Desktop-bobs-project-jchsanGi/baba59d8-18dc-4777-a5af-e9513498e479/scratchpad/errors.html';
const { results } = JSON.parse(fs.readFileSync(IN, 'utf8'));
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const errs = results.filter((r) => (r.A.flags && r.A.flags.length) || (r.B.flags && r.B.flags.length));

const armBlock = (arm, label, cls) => {
  const hasErr = arm.flags && arm.flags.length;
  if (!arm.accepted) return `<div class="arm ${cls} ${hasErr ? 'bad' : ''}"><div class="arm-h">${label}</div><div class="clean">반려(채택 안됨)</div></div>`;
  const g = arm.accepted;
  return `<div class="arm ${cls} ${hasErr ? 'bad' : ''}">
    <div class="arm-h">${label} ${hasErr ? `<span class="flag">⚠ ${arm.flags.map(esc).join(', ')}</span>` : '<span class="ok">✓ 정상</span>'}</div>
    <div class="field"><span class="lb">문제</span><div class="q">${esc(g.question_text)}</div></div>
    ${g.examples ? `<div class="field"><span class="lb">보기/코드</span><pre>${esc(g.examples)}</pre></div>` : ''}
    <div class="field"><span class="lb">생성 정답</span><div class="ans ${hasErr ? 'err' : ''}">${esc(g.answer)}</div></div>
    <div class="field"><span class="lb">해설</span><div class="cm">${esc(g.comment)}</div></div>
  </div>`;
};
const cards = errs.map((r, i) => `
  <section class="card">
    <div class="card-h"><span class="idx">${i + 1}</span><span class="cat">${esc(r.anchor.category)}</span><span class="src">${esc(r.anchor.source)} #${r.anchor.no}</span></div>
    <div class="orig"><span class="lb">원본(본보기)</span><div class="q">${esc(r.anchor.question_text)}</div><div class="ans">정답: ${esc(r.anchor.answer)}</div></div>
    <div class="arms">${armBlock(r.A, '방식 A · 본보기 1개', 'a')}${armBlock(r.B, '방식 B · RAG 참고', 'b')}</div>
  </section>`).join('');

const aErr = results.filter((r) => r.A.flags?.length).length;
const bErr = results.filter((r) => r.B.flags?.length).length;
const html = `<title>오류 난 생성 문제 — 100개 중</title>
<style>
  :root{--paper:#FAFBFC;--surface:#fff;--ink:#19212E;--muted:#68717F;--faint:#9AA1AD;--border:#E5E9F0;--panel:#F2F5F9;
    --a:#C77A2E;--a-soft:#FBF1E4;--b:#0E8C7F;--b-soft:#E5F4F1;--bad:#C0392F;--bad-soft:#FBEAE6;--good:#1F9D6B;
    --mono:ui-monospace,"SF Mono",Menlo,monospace;--sans:-apple-system,BlinkMacSystemFont,"Segoe UI","Pretendard","Apple SD Gothic Neo",sans-serif;}
  *{box-sizing:border-box;}body{margin:0;background:var(--paper);color:var(--ink);font-family:var(--sans);line-height:1.5;-webkit-font-smoothing:antialiased;}
  .wrap{max-width:1080px;margin:0 auto;padding:44px 24px 90px;}
  .eyebrow{font-family:var(--mono);font-size:11.5px;letter-spacing:.14em;text-transform:uppercase;color:var(--faint);margin:0 0 12px;}
  h1{font-size:clamp(22px,3.4vw,30px);letter-spacing:-.02em;margin:0 0 8px;font-weight:680;}
  .lede{font-size:14.5px;color:var(--muted);max-width:66ch;margin:0 0 18px;}
  .sum{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px;}
  .pill{font-family:var(--mono);font-size:12.5px;padding:6px 12px;border-radius:8px;border:1px solid var(--border);background:var(--surface);}
  .pill b{font-size:15px;} .pa b{color:var(--a);} .pb b{color:var(--b);}
  .warn{font-size:12.5px;color:var(--muted);background:var(--bad-soft);border:1px solid #F1CFC6;border-radius:8px;padding:11px 14px;margin-bottom:28px;}
  .card{border:1px solid var(--border);border-radius:14px;background:var(--surface);padding:18px;margin-bottom:16px;}
  .card-h{display:flex;align-items:center;gap:10px;margin-bottom:12px;}
  .idx{font-family:var(--mono);font-weight:700;width:24px;height:24px;border-radius:6px;background:var(--bad);color:#fff;display:flex;align-items:center;justify-content:center;font-size:12px;}
  .cat{font-family:var(--mono);font-size:11px;background:var(--panel);padding:2px 8px;border-radius:5px;} .src{font-family:var(--mono);font-size:11px;color:var(--faint);}
  .orig{background:var(--panel);border-radius:10px;padding:12px 14px;margin-bottom:14px;}
  .lb{font-family:var(--mono);font-size:10.5px;letter-spacing:.06em;text-transform:uppercase;color:var(--faint);display:block;margin-bottom:4px;}
  .arms{display:grid;grid-template-columns:1fr 1fr;gap:14px;} @media(max-width:720px){.arms{grid-template-columns:1fr}}
  .arm{border:1px solid var(--border);border-radius:11px;padding:14px;}
  .arm.a{background:var(--a-soft);border-color:#EAD6BC;} .arm.b{background:var(--b-soft);border-color:#BEE3DC;}
  .arm.bad{border:2px solid var(--bad);background:var(--bad-soft);}
  .arm-h{font-family:var(--mono);font-size:12px;font-weight:640;margin-bottom:10px;display:flex;flex-wrap:wrap;gap:8px;align-items:center;}
  .arm.a .arm-h{color:var(--a);} .arm.b .arm-h{color:var(--b);}
  .flag{font-family:var(--mono);font-size:10.5px;font-weight:700;padding:2px 7px;border-radius:5px;background:var(--bad);color:#fff;}
  .ok{font-family:var(--mono);font-size:10.5px;font-weight:600;padding:2px 7px;border-radius:5px;background:#E4F5EC;color:var(--good);}
  .field{margin-bottom:9px;} .q{font-size:14px;line-height:1.5;white-space:pre-wrap;}
  .ans{font-family:var(--mono);font-size:13px;font-weight:600;} .ans.err{color:var(--bad);}
  .cm{font-size:12.5px;color:var(--muted);line-height:1.5;}
  pre{font-family:var(--mono);font-size:12px;line-height:1.5;white-space:pre-wrap;background:var(--surface);border:1px solid var(--border);border-radius:7px;padding:9px 11px;margin:0;overflow-x:auto;}
  .clean{color:var(--muted);font-size:13px;}
</style>
<div class="wrap">
  <p class="eyebrow">AI Quality Lab · 오류 케이스 (100개 중)</p>
  <h1>오류로 판정된 생성 문제 — ${errs.length}건</h1>
  <p class="lede">100개 생성 중 검사기가 오류로 표시한 문제만 모았어요. 대부분 <b>Code(코드)</b>의 정답오류 — 코드 실행결과 정답을 잘못 만든 경우.</p>
  <div class="sum">
    <span class="pill pa">방식 A 오류 <b>${aErr}</b>건</span>
    <span class="pill pb">방식 B 오류 <b>${bErr}</b>건</span>
    <span class="pill">겹치거나 한쪽만 오류: 총 <b>${errs.length}</b>문항</span>
  </div>
  <div class="warn">⚠️ 오류 판정은 <b>LLM(gpt-4.1-mini)이 코드·정답을 검토해서 매긴 것</b>이라 확정이 아니에요. 특히 코드 정답오류는 <b>사람이 직접 코드를 돌려</b> 확인해야 최종 확정됩니다. 빨간 테두리 = 오류 표시된 쪽.</div>
  ${cards}
</div>`;
fs.writeFileSync(OUT, html);
console.log(`오류 ${errs.length}건 HTML 생성:`, OUT);
