import fs from 'fs';
const IN = process.argv[2] || '/private/tmp/claude-501/-Users-bobs-Desktop-bobs-project-jchsanGi/baba59d8-18dc-4777-a5af-e9513498e479/scratchpad/compare100.json';
const OUTJSON = process.argv[3] || '/private/tmp/claude-501/-Users-bobs-Desktop-bobs-project-jchsanGi/baba59d8-18dc-4777-a5af-e9513498e479/scratchpad/checkpoints.json';
const OUTHTML = process.argv[4] || '/private/tmp/claude-501/-Users-bobs-Desktop-bobs-project-jchsanGi/baba59d8-18dc-4777-a5af-e9513498e479/scratchpad/checkpoints.html';
const CHECKPOINTS = [25, 50, 100];

const { results } = JSON.parse(fs.readFileSync(IN, 'utf8'));
const agg = (rows, arm) => {
  const acc = rows.filter((r) => r[arm].accepted).length;
  const regen = rows.filter((r) => r[arm].regenerated).length;
  const err = rows.filter((r) => r[arm].accepted && r[arm].flags?.length).length;
  return {
    accepted: acc,
    regenRate: rows.length ? +((regen / rows.length) * 100).toFixed(1) : 0,
    errRate: acc ? +((err / acc) * 100).toFixed(1) : 0,
  };
};

const rows = [];
for (const cp of CHECKPOINTS) {
  if (results.length < cp) continue;
  const slice = results.slice(0, cp);
  rows.push({ at: cp, A: agg(slice, 'A'), B: agg(slice, 'B') });
}
fs.writeFileSync(OUTJSON, JSON.stringify({ done: results.length, checkpoints: rows }, null, 2));

console.log(`진행 ${results.length}/100 · 체크포인트 ${rows.map((r) => r.at).join(', ') || '없음(25 미도달)'}`);
rows.forEach((r) => console.log(`  @${r.at}: A 재생성 ${r.A.regenRate}% 오류 ${r.A.errRate}% | B 재생성 ${r.B.regenRate}% 오류 ${r.B.errRate}%`));

// HTML
const cell = (v, kind) => `<td class="m ${kind}">${v}%</td>`;
const trs = rows.map((r) => `
  <tr>
    <td class="cp">${r.at}문제</td>
    ${cell(r.A.regenRate, 'a')}${cell(r.A.errRate, 'a err')}
    ${cell(r.B.regenRate, 'b')}${cell(r.B.errRate, 'b err')}
    <td class="delta">${(r.A.errRate - r.B.errRate).toFixed(1)}%p</td>
  </tr>`).join('');
const pending = CHECKPOINTS.filter((c) => results.length < c);
const html = `<title>체크포인트 비교 — 비포(A) vs 애프터(B)</title>
<style>
  :root{--paper:#FAFBFC;--surface:#fff;--ink:#19212E;--muted:#68717F;--faint:#9AA1AD;--border:#E5E9F0;--panel:#F2F5F9;
    --a:#C77A2E;--b:#0E8C7F;--bad:#C0392F;--good:#1F9D6B;--mono:ui-monospace,"SF Mono",Menlo,monospace;--sans:-apple-system,BlinkMacSystemFont,"Segoe UI","Pretendard","Apple SD Gothic Neo",sans-serif;}
  *{box-sizing:border-box;}body{margin:0;background:var(--paper);color:var(--ink);font-family:var(--sans);line-height:1.5;-webkit-font-smoothing:antialiased;}
  .wrap{max-width:760px;margin:0 auto;padding:44px 24px 60px;}
  .eyebrow{font-family:var(--mono);font-size:11.5px;letter-spacing:.14em;text-transform:uppercase;color:var(--faint);margin:0 0 12px;}
  h1{font-size:clamp(21px,3.3vw,28px);letter-spacing:-.02em;margin:0 0 6px;font-weight:680;}
  .sub{font-size:14px;color:var(--muted);margin:0 0 24px;}
  .tbl{border:1px solid var(--border);border-radius:13px;overflow:hidden;background:var(--surface);overflow-x:auto;}
  table{border-collapse:collapse;width:100%;min-width:560px;}
  thead th{font-family:var(--mono);font-size:11px;text-transform:uppercase;color:var(--faint);font-weight:600;padding:11px 12px;border-bottom:1px solid var(--border);background:var(--panel);text-align:right;}
  thead th.l{text-align:left;}
  thead th.ga{color:var(--a);} thead th.gb{color:var(--b);}
  td{padding:12px;border-bottom:1px solid var(--border);text-align:right;font-variant-numeric:tabular-nums;} tr:last-child td{border:none;}
  .cp{text-align:left;font-weight:700;font-family:var(--mono);}
  .m{font-family:var(--mono);font-size:14px;} .a{color:var(--a);} .b{color:var(--b);font-weight:600;} .err{font-weight:700;}
  .delta{font-family:var(--mono);font-weight:700;color:var(--good);}
  .head2{display:grid;grid-template-columns:1fr 1fr;gap:0;}
  .note{font-size:12.5px;color:var(--muted);background:var(--panel);border-radius:8px;padding:11px 14px;margin-top:20px;}
  .leg{display:flex;gap:18px;font-size:12.5px;color:var(--muted);margin:14px 2px 0;}
  .leg b{font-family:var(--mono);} .la{color:var(--a);} .lb{color:var(--b);}
</style>
<div class="wrap">
  <p class="eyebrow">AI Quality Lab · 스케일별 체크포인트</p>
  <h1>비포(A) vs 애프터(B) — 25 / 50 / 100 시점</h1>
  <p class="sub">진행 ${results.length}/100 · 같은 원본으로 A(본보기1개)·B(RAG참고) 생성, 시점별 재생성률·오류율.</p>
  <div class="tbl">
    <table>
      <thead><tr>
        <th class="l">시점</th>
        <th class="ga">A 재생성</th><th class="ga">A 오류</th>
        <th class="gb">B 재생성</th><th class="gb">B 오류</th>
        <th>오류 감소</th>
      </tr></thead>
      <tbody>${trs || '<tr><td colspan="6" style="text-align:center;color:var(--faint)">25문제 도달 전</td></tr>'}</tbody>
    </table>
  </div>
  <div class="leg"><span class="la">■ A = 예전 JSON식(본보기 1개)</span><span class="lb">■ B = DB·RAG식(비슷한 기출 참고)</span></div>
  <div class="note">"오류 감소" = A 오류율 − B 오류율 (클수록 RAG가 오류를 많이 줄였다는 뜻).${pending.length ? ` 아직 ${pending.join(', ')} 시점 미도달 — 진행되면 채워집니다.` : ' 100 완료.'}</div>
</div>`;
fs.writeFileSync(OUTHTML, html);
console.log('HTML:', OUTHTML);
