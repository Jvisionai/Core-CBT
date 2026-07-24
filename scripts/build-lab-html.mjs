import fs from 'fs';
const IN = process.argv[2] || '/private/tmp/claude-501/-Users-bobs-Desktop-bobs-project-jchsanGi/baba59d8-18dc-4777-a5af-e9513498e479/scratchpad/compare100.json';
const OUT = process.argv[3] || '/private/tmp/claude-501/-Users-bobs-Desktop-bobs-project-jchsanGi/baba59d8-18dc-4777-a5af-e9513498e479/scratchpad/lab.html';
const { results } = JSON.parse(fs.readFileSync(IN, 'utf8'));

// 체크포인트 계산
const agg = (rows, arm) => {
  const acc = rows.filter((r) => r[arm].accepted).length;
  const regen = rows.filter((r) => r[arm].regenerated).length;
  const err = rows.filter((r) => r[arm].accepted && r[arm].flags?.length).length;
  return { acc, regenRate: rows.length ? +((regen / rows.length) * 100).toFixed(1) : 0, errRate: acc ? +((err / acc) * 100).toFixed(1) : 0 };
};
const checkpoints = [25, 50, 75, 100].filter((c) => results.length >= c).map((cp) => ({ at: cp, A: agg(results.slice(0, cp), 'A'), B: agg(results.slice(0, cp), 'B') }));
const catStat = {};
for (const r of results) { const c = r.anchor.category; (catStat[c] = catStat[c] || { n: 0, a: 0, b: 0 }); catStat[c].n++; if (r.A.flags?.length) catStat[c].a++; if (r.B.flags?.length) catStat[c].b++; }

// 카드용 최소 데이터
const slim = results.map((r) => ({
  cat: r.anchor.category, src: r.anchor.source, no: r.anchor.no,
  oq: r.anchor.question_text, oa: r.anchor.answer,
  A: r.A.accepted ? { q: r.A.accepted.question_text, e: r.A.accepted.examples || '', a: r.A.accepted.answer, c: r.A.accepted.comment || '', f: r.A.flags || [] } : { rej: true, f: r.A.flags || [] },
  B: r.B.accepted ? { q: r.B.accepted.question_text, e: r.B.accepted.examples || '', a: r.B.accepted.answer, c: r.B.accepted.comment || '', f: r.B.flags || [] } : { rej: true, f: r.B.flags || [] },
}));
const DATA = { summary: { n: results.length, A: agg(results, 'A'), B: agg(results, 'B') }, checkpoints, catStat, results: slim };
const blob = JSON.stringify(DATA).replace(/</g, '\\u003c');

const html = `<title>AI Quality Lab — 결과 도구</title>
<style>
  :root{--paper:#FAFBFC;--surface:#fff;--ink:#19212E;--muted:#68717F;--faint:#9AA1AD;--border:#E5E9F0;--panel:#F2F5F9;
    --a:#C77A2E;--a-soft:#FBF1E4;--b:#0E8C7F;--b-soft:#E5F4F1;--bad:#C0392F;--bad-soft:#FBEAE6;--good:#1F9D6B;--lab:#6D4AC7;
    --mono:ui-monospace,"SF Mono",Menlo,monospace;--sans:-apple-system,BlinkMacSystemFont,"Segoe UI","Pretendard","Apple SD Gothic Neo",sans-serif;}
  *{box-sizing:border-box;}body{margin:0;background:var(--paper);color:var(--ink);font-family:var(--sans);line-height:1.5;-webkit-font-smoothing:antialiased;}
  .wrap{max-width:1080px;margin:0 auto;padding:36px 24px 90px;}
  .eyebrow{font-family:var(--mono);font-size:11.5px;letter-spacing:.14em;text-transform:uppercase;color:var(--faint);margin:0 0 10px;}
  h1{font-size:clamp(21px,3.3vw,29px);letter-spacing:-.02em;margin:0 0 18px;font-weight:680;}
  .tabs{display:flex;gap:6px;border-bottom:1px solid var(--border);margin-bottom:20px;flex-wrap:wrap;}
  .tab{font-family:var(--mono);font-size:13px;font-weight:600;padding:10px 16px;border:none;background:none;color:var(--muted);cursor:pointer;border-bottom:2px solid transparent;margin-bottom:-1px;}
  .tab:hover{color:var(--ink);} .tab.on{color:var(--lab);border-bottom-color:var(--lab);}
  #filters{display:none;gap:14px;align-items:center;flex-wrap:wrap;background:var(--panel);border:1px solid var(--border);border-radius:10px;padding:12px 16px;margin-bottom:18px;}
  #filters label{font-size:13px;color:var(--muted);display:flex;align-items:center;gap:7px;font-family:var(--mono);}
  select{font-family:var(--mono);font-size:13px;padding:5px 9px;border:1px solid var(--border-strong,#D2D8E2);border-radius:7px;background:#fff;}
  .cnt{font-family:var(--mono);font-size:12px;color:var(--faint);margin-left:auto;}
  .view{display:none;} .view.on{display:block;}
  /* summary */
  .cmp{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:16px;}@media(max-width:640px){.cmp{grid-template-columns:1fr}}
  .card2{border:1px solid var(--border);border-radius:14px;background:var(--surface);padding:18px 20px;}
  .card2.a{border-top:3px solid var(--a);} .card2.b{border-top:3px solid var(--b);}
  .card2 .t{font-family:var(--mono);font-size:12.5px;font-weight:640;margin-bottom:12px;} .card2.a .t{color:var(--a);} .card2.b .t{color:var(--b);}
  .met{margin-bottom:12px;} .met .l{font-size:12px;color:var(--muted);} .met .v{font-size:22px;font-weight:700;font-variant-numeric:tabular-nums;} .met.err .v{color:var(--bad);}
  /* table */
  .tbl{border:1px solid var(--border);border-radius:12px;overflow:hidden;background:var(--surface);overflow-x:auto;margin-bottom:14px;}
  table{border-collapse:collapse;width:100%;min-width:520px;} th{font-family:var(--mono);font-size:11px;text-transform:uppercase;color:var(--faint);padding:10px 12px;border-bottom:1px solid var(--border);text-align:right;background:var(--panel);} th.l{text-align:left;} th.ga{color:var(--a)}th.gb{color:var(--b)}
  td{padding:11px 12px;border-bottom:1px solid var(--border);text-align:right;font-variant-numeric:tabular-nums;font-family:var(--mono);font-size:13.5px;} tr:last-child td{border:none;} td.l{text-align:left;font-weight:700;} .a{color:var(--a)} .b{color:var(--b);font-weight:600} .err{font-weight:700} .delta{color:var(--good);font-weight:700}
  /* cards */
  .card{border:1px solid var(--border);border-radius:14px;background:var(--surface);padding:16px;margin-bottom:14px;}
  .card-h{display:flex;align-items:center;gap:9px;margin-bottom:10px;} .idx{font-family:var(--mono);font-weight:700;min-width:24px;height:24px;padding:0 6px;border-radius:6px;background:var(--ink);color:#fff;display:flex;align-items:center;justify-content:center;font-size:12px;} .idx.e{background:var(--bad);}
  .cat{font-family:var(--mono);font-size:11px;background:var(--panel);padding:2px 8px;border-radius:5px;} .src{font-family:var(--mono);font-size:11px;color:var(--faint);}
  .orig{background:var(--panel);border-radius:10px;padding:11px 13px;margin-bottom:12px;} .lb{font-family:var(--mono);font-size:10.5px;letter-spacing:.06em;text-transform:uppercase;color:var(--faint);display:block;margin-bottom:4px;}
  .arms{display:grid;grid-template-columns:1fr 1fr;gap:12px;}@media(max-width:720px){.arms{grid-template-columns:1fr}}
  .arm{border:1px solid var(--border);border-radius:10px;padding:13px;} .arm.a{background:var(--a-soft);border-color:#EAD6BC} .arm.b{background:var(--b-soft);border-color:#BEE3DC} .arm.bad{border:2px solid var(--bad);background:var(--bad-soft)}
  .arm-h{font-family:var(--mono);font-size:11.5px;font-weight:640;margin-bottom:9px;display:flex;gap:7px;flex-wrap:wrap;align-items:center} .arm.a .arm-h{color:var(--a)} .arm.b .arm-h{color:var(--b)}
  .flag{font-family:var(--mono);font-size:10px;font-weight:700;padding:2px 6px;border-radius:5px;background:var(--bad);color:#fff} .ok{font-family:var(--mono);font-size:10px;font-weight:600;padding:2px 6px;border-radius:5px;background:#E4F5EC;color:var(--good)}
  .field{margin-bottom:8px} .q{font-size:13.5px;white-space:pre-wrap} .ans{font-family:var(--mono);font-size:12.5px;font-weight:600} .ans.er{color:var(--bad)} .cm{font-size:12px;color:var(--muted)} pre{font-family:var(--mono);font-size:11.5px;white-space:pre-wrap;background:#fff;border:1px solid var(--border);border-radius:6px;padding:8px 10px;margin:0;overflow-x:auto}
  .rej{color:var(--muted);font-size:12.5px} .note{font-size:12.5px;color:var(--muted);background:var(--panel);border-radius:8px;padding:11px 14px;margin-bottom:16px}
</style>
<div class="wrap">
  <p class="eyebrow">AI Quality Lab · 100개 결과 · JSON식(A) vs DB·RAG식(B)</p>
  <h1>생성 품질 비교 도구</h1>
  <div class="tabs">
    <button class="tab on" data-t="summary" onclick="show('summary')">요약</button>
    <button class="tab" data-t="checkpoints" onclick="show('checkpoints')">체크포인트</button>
    <button class="tab" data-t="compare" onclick="show('compare')">문제 비교</button>
  </div>
  <div id="filters">
    <label>카테고리
      <select id="fcat" onchange="renderCards()"><option value="all">전체</option><option>Code</option><option>이론</option><option>SQL</option></select>
    </label>
    <label><input type="checkbox" id="ferr" onchange="renderCards()"> 오류만 보기</label>
    <span class="cnt"><span id="count">0</span>문항</span>
  </div>
  <div id="view-summary" class="view on"></div>
  <div id="view-checkpoints" class="view"></div>
  <div id="view-compare" class="view"><div id="cards"></div></div>
</div>
<script>
const DATA = JSON.parse("${blob.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}");
const esc = (s) => String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
function show(t){
  document.querySelectorAll('.tab').forEach(x=>x.classList.toggle('on',x.dataset.t===t));
  document.querySelectorAll('.view').forEach(v=>v.classList.toggle('on',v.id==='view-'+t));
  document.getElementById('filters').style.display = t==='compare' ? 'flex':'none';
  if(t==='compare') renderCards();
}
// 요약
(function(){
  const S=DATA.summary;
  const met=(l,v,err)=>'<div class="met '+(err?'err':'')+'"><div class="l">'+l+'</div><div class="v">'+v+'</div></div>';
  const cat=Object.entries(DATA.catStat).map(([c,v])=>'<tr><td class="l">'+c+'</td><td>'+v.n+'</td><td class="a err">'+v.a+'</td><td class="b err">'+v.b+'</td></tr>').join('');
  document.getElementById('view-summary').innerHTML =
    '<div class="note">같은 원본 '+S.n+'개로 A(본보기1개)·B(RAG 비슷한기출 참고) 생성. 오류=RAG유형·해설↔정답·정답오류 중 하나라도.</div>'+
    '<div class="cmp"><div class="card2 a"><div class="t">방식 A · 예전 JSON식</div>'+met('오류율',S.A.errRate+'%',1)+met('재생성률',S.A.regenRate+'%')+met('채택',S.A.acc+'/'+S.n)+'</div>'+
    '<div class="card2 b"><div class="t">방식 B · DB·RAG식</div>'+met('오류율',S.B.errRate+'%',1)+met('재생성률',S.B.regenRate+'%')+met('채택',S.B.acc+'/'+S.n)+'</div></div>'+
    '<div class="tbl"><table><thead><tr><th class="l">카테고리</th><th>문항</th><th class="ga">A 오류</th><th class="gb">B 오류</th></tr></thead><tbody>'+cat+'</tbody></table></div>';
})();
// 체크포인트
(function(){
  const rows=DATA.checkpoints.map(r=>'<tr><td class="l">'+r.at+'문제</td><td class="a">'+r.A.regenRate+'%</td><td class="a err">'+r.A.errRate+'%</td><td class="b">'+r.B.regenRate+'%</td><td class="b err">'+r.B.errRate+'%</td><td class="delta">'+(r.A.errRate-r.B.errRate).toFixed(1)+'%p</td></tr>').join('');
  document.getElementById('view-checkpoints').innerHTML=
    '<div class="tbl"><table><thead><tr><th class="l">시점</th><th class="ga">A 재생성</th><th class="ga">A 오류</th><th class="gb">B 재생성</th><th class="gb">B 오류</th><th>오류감소</th></tr></thead><tbody>'+rows+'</tbody></table></div>'+
    '<div class="note">"오류감소"=A오류율−B오류율. 표본이 커질수록(→100) 차이가 좁혀졌음: RAG 효과는 있으나 소표본에서 과대평가됐던 것.</div>';
})();
// 문제 비교 카드
function armHtml(arm,label,cls){
  const bad=arm.f&&arm.f.length;
  if(arm.rej) return '<div class="arm '+cls+(bad?' bad':'')+'"><div class="arm-h">'+label+'</div><div class="rej">반려(채택 안됨)</div></div>';
  return '<div class="arm '+cls+(bad?' bad':'')+'"><div class="arm-h">'+label+' '+(bad?'<span class="flag">⚠ '+arm.f.map(esc).join(', ')+'</span>':'<span class="ok">✓ 정상</span>')+'</div>'+
    '<div class="field"><span class="lb">문제</span><div class="q">'+esc(arm.q)+'</div></div>'+
    (arm.e?'<div class="field"><span class="lb">보기/코드</span><pre>'+esc(arm.e)+'</pre></div>':'')+
    '<div class="field"><span class="lb">생성 정답</span><div class="ans '+(bad?'er':'')+'">'+esc(arm.a)+'</div></div>'+
    '<div class="field"><span class="lb">해설</span><div class="cm">'+esc(arm.c)+'</div></div></div>';
}
function renderCards(){
  const cat=document.getElementById('fcat').value, errOnly=document.getElementById('ferr').checked;
  const rows=DATA.results.filter(r=>(cat==='all'||r.cat===cat)&&(!errOnly||(r.A.f&&r.A.f.length)||(r.B.f&&r.B.f.length)));
  document.getElementById('count').textContent=rows.length;
  document.getElementById('cards').innerHTML=rows.map((r,i)=>{
    const isErr=(r.A.f&&r.A.f.length)||(r.B.f&&r.B.f.length);
    return '<section class="card"><div class="card-h"><span class="idx'+(isErr?' e':'')+'">'+(i+1)+'</span><span class="cat">'+esc(r.cat)+'</span><span class="src">'+esc(r.src)+' #'+r.no+'</span></div>'+
      '<div class="orig"><span class="lb">원본(본보기)</span><div class="q">'+esc(r.oq)+'</div><div class="ans">정답: '+esc(r.oa)+'</div></div>'+
      '<div class="arms">'+armHtml(r.A,'방식 A · 본보기1','a')+armHtml(r.B,'방식 B · RAG참고','b')+'</div></section>';
  }).join('')||'<p style="color:var(--faint)">해당 없음</p>';
}
</script>`;
fs.writeFileSync(OUT, html);
console.log('통합 도구 HTML 생성:', OUT, '| 결과', results.length, '건');
