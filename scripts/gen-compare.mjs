import 'dotenv/config';
import fs from 'fs';
import { sql } from '../db/client.js';
import {
  buildGeneratorPrompt, buildJudgePrompt, validateGeneratedProblem, parseModelJson,
} from '@/lib/variantGeneration';

const KEY = process.env.OPENAI_API_KEY;
const GEN_MODEL = 'gpt-4.1';
const MAX_REGEN = 2;
const N = Number(process.argv[2]) || 4;
const RAG_THRESHOLD = 0.45;
const OUT = process.argv[3] || '/private/tmp/claude-501/-Users-bobs-Desktop-bobs-project-jchsanGi/baba59d8-18dc-4777-a5af-e9513498e479/scratchpad/compare-results.json';
const judgeModelFor = (c) => (c === 'Code' || c === 'SQL' ? 'gpt-4.1' : 'gpt-4.1-mini');

async function callResponses(model, input, maxTokens) {
  const r = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` },
    body: JSON.stringify({ model, input, max_output_tokens: maxTokens }),
  });
  if (!r.ok) throw new Error(`openai ${model} ${r.status}`);
  const d = await r.json();
  return (d.output || []).flatMap((i) => i?.content || []).map((c) => c?.text || '').join('').trim();
}
async function embed(text) {
  const r = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` },
    body: JSON.stringify({ model: 'text-embedding-3-small', input: [text] }),
  });
  return (await r.json()).data[0].embedding;
}
async function ragScore(gen, category) {
  const vec = `[${(await embed(`[${category}] ${gen.question_text}\n${gen.examples || ''}`.slice(0, 6000))).join(',')}]`;
  const rows = await sql`SELECT 1-(embedding <=> ${vec}::vector) AS sim FROM practical_problems
    WHERE embedding IS NOT NULL AND category=${category} ORDER BY embedding <=> ${vec}::vector LIMIT 1`;
  return rows[0] ? Number(rows[0].sim) : 0;
}
async function answerCheck(gen) {
  const prompt = `실기 문제의 정답·해설을 판정하라. JSON만: {"consistent":bool,"correct":bool,"reason":"짧은 사유"}
문제: ${gen.question_text}\n${gen.examples ? `보기:\n${gen.examples}\n` : ''}정답: ${gen.answer}\n해설: ${gen.comment || ''}`;
  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` },
    body: JSON.stringify({ model: 'gpt-4.1-mini', messages: [{ role: 'user', content: prompt }], response_format: { type: 'json_object' }, temperature: 0 }),
  });
  return JSON.parse((await r.json()).choices[0].message.content);
}

// arm 한 번 실행 (extraContext = 방식 B의 RAG 예시들)
async function runArm(anchor, extraContext) {
  const original = { question_text: anchor.question_text, examples: anchor.examples, category: anchor.category, subcategory: '' };
  const reasons = [];
  let accepted = null, attempts = 0, regen = 0;
  for (let attempt = 0; attempt <= MAX_REGEN; attempt += 1) {
    attempts += 1; if (attempt >= 1) regen += 1;
    let prompt = buildGeneratorPrompt({ original, answer: anchor.answer, comment: anchor.comment, concept: anchor.category, failureReasons: reasons });
    if (extraContext) prompt += `\n\n[비슷한 기출 예시 — 이 스타일·난이도를 참고해서 새로 만들 것]\n${extraContext}`;
    let gen = null;
    try { gen = parseModelJson(await callResponses(GEN_MODEL, prompt, 1500)); } catch { reasons.push('생성 오류'); continue; }
    if (!gen) { reasons.push('JSON 파싱 실패'); continue; }
    const gate = validateGeneratedProblem(gen, original);
    if (!gate.ok) { reasons.push(gate.reason); continue; }
    let verdict = null;
    try { verdict = parseModelJson(await callResponses(judgeModelFor(anchor.category), buildJudgePrompt({ gen, original, answer: anchor.answer }), 600)); } catch {}
    if (verdict && verdict.concept_same && verdict.answer_correct && verdict.no_leak && verdict.difficulty_ok) { accepted = gen; break; }
    reasons.push(`심판 반려: ${verdict?.reason || '판정 실패'}`);
  }
  const out = { attempts, regenerated: regen > 0, accepted, failureReasons: reasons };
  if (accepted) {
    out.rag = await ragScore(accepted, anchor.category);
    const ac = await answerCheck(accepted);
    out.flags = [];
    if (out.rag < RAG_THRESHOLD) out.flags.push('유형벗어남');
    if (!ac.consistent) out.flags.push('해설불일치');
    if (!ac.correct) out.flags.push('정답오류');
  }
  return out;
}

const anchors = await sql`
  SELECT p.id, s.key AS source, p.problem_no, p.category, p.question_text,
         coalesce(p.examples,'') AS examples, p.answer, coalesce(p.comment,'') AS comment
  FROM practical_problems p JOIN sources s ON s.id = p.source_id
  WHERE p.answer_kind <> 'freeform' AND p.embedding IS NOT NULL
  ORDER BY random() LIMIT ${N}`;

const results = [];
for (const a of anchors) {
  console.log(`\n[${a.source}#${a.problem_no} ${a.category}] ${a.question_text.slice(0, 40)}...`);
  // 방식 B용: 비슷한 기출 3개 검색 (앵커 자신 제외)
  const similar = await sql`
    SELECT p.question_text, p.answer FROM practical_problems p, (SELECT embedding FROM practical_problems WHERE id=${a.id}) anc
    WHERE p.id <> ${a.id} AND p.category=${a.category} AND p.embedding IS NOT NULL
    ORDER BY p.embedding <=> anc.embedding LIMIT 3`;
  const ctx = similar.map((s, i) => `예시${i + 1}) 문제: ${s.question_text}\n   정답: ${s.answer}`).join('\n');

  console.log('  방식 A (본보기 1개) 실행...');
  const A = await runArm(a, null);
  console.log(`    → ${A.accepted ? '채택' : '반려'} · 재생성 ${A.regenerated ? 'O' : 'X'} · 오류 ${A.flags?.join(',') || '없음'}`);
  console.log('  방식 B (비슷한 기출 3개 참고) 실행...');
  const B = await runArm(a, ctx);
  console.log(`    → ${B.accepted ? '채택' : '반려'} · 재생성 ${B.regenerated ? 'O' : 'X'} · 오류 ${B.flags?.join(',') || '없음'}`);

  results.push({ anchor: { source: a.source, no: a.problem_no, category: a.category, question_text: a.question_text, examples: a.examples, answer: a.answer }, similar: similar.map((s) => s.question_text), A, B });
}

const agg = (arm) => {
  const acc = results.filter((r) => r[arm].accepted).length;
  const regen = results.filter((r) => r[arm].regenerated).length;
  const err = results.filter((r) => r[arm].accepted && r[arm].flags?.length).length;
  return { accepted: acc, regenRate: ((regen / results.length) * 100).toFixed(0), errRate: acc ? ((err / acc) * 100).toFixed(0) : '0' };
};
const summary = { n: results.length, A: agg('A'), B: agg('B') };
fs.writeFileSync(OUT, JSON.stringify({ summary, results }, null, 2));
console.log(`\n=== 요약 (앵커 ${summary.n}) ===`);
console.log(`방식 A: 채택 ${summary.A.accepted} · 재생성률 ${summary.A.regenRate}% · 오류율 ${summary.A.errRate}%`);
console.log(`방식 B: 채택 ${summary.B.accepted} · 재생성률 ${summary.B.regenRate}% · 오류율 ${summary.B.errRate}%`);
console.log(`결과 저장: ${OUT}`);
await sql.end();
