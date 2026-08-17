import dotenv from 'dotenv';
dotenv.config();
dotenv.config({ path: '.env.local' });
import { Langfuse } from 'langfuse';
import { sql } from '../db/client.js';
import { validateGeneratedProblem, parseModelJson } from '@/lib/variantGeneration';

const KEY = process.env.OPENAI_API_KEY;
const GEN_MODEL = 'gpt-4.1';
const MAX_REGEN = 2;
const N = Number(process.argv[2]) || 25;
const RAG_THRESHOLD = 0.45;
const judgeModelFor = (c) => (c === 'Code' || c === 'SQL' ? 'gpt-4.1' : 'gpt-4.1-mini');

const lf = new Langfuse({
  secretKey: process.env.LANGFUSE_SECRET_KEY,
  publicKey: process.env.LANGFUSE_PUBLIC_KEY,
  baseUrl: process.env.LANGFUSE_BASE_URL,
});

async function retry(fn, tries = 4, base = 2000) {
  let last;
  for (let i = 0; i < tries; i += 1) { try { return await fn(); } catch (e) { last = e; if (i < tries - 1) await new Promise((r) => setTimeout(r, base * (i + 1))); } }
  throw last;
}
const T = 150000;
async function callResponses(model, input, maxTokens) {
  return retry(async () => {
    const r = await fetch('https://api.openai.com/v1/responses', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` }, body: JSON.stringify({ model, input, max_output_tokens: maxTokens }), signal: AbortSignal.timeout(T) });
    if (!r.ok) throw new Error(`openai ${model} ${r.status}`);
    const d = await r.json();
    return { text: (d.output || []).flatMap((i) => i?.content || []).map((c) => c?.text || '').join('').trim(), usage: d.usage };
  });
}
async function embed(text) {
  return retry(async () => {
    const r = await fetch('https://api.openai.com/v1/embeddings', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` }, body: JSON.stringify({ model: 'text-embedding-3-small', input: [text] }), signal: AbortSignal.timeout(T) });
    if (!r.ok) throw new Error(`embed ${r.status}`); return (await r.json()).data[0].embedding;
  });
}
async function ragScore(gen, category) {
  const vec = `[${(await embed(`[${category}] ${gen.question_text}\n${gen.examples || ''}`.slice(0, 6000))).join(',')}]`;
  const rows = await sql`SELECT 1-(embedding <=> ${vec}::vector) AS sim FROM practical_problems WHERE embedding IS NOT NULL AND category=${category} ORDER BY embedding <=> ${vec}::vector LIMIT 1`;
  return rows[0] ? Number(rows[0].sim) : 0;
}
async function answerCheck(gen) {
  return retry(async () => {
    const prompt = `실기 문제 정답·해설 판정. JSON만: {"consistent":bool,"correct":bool,"reason":"짧은 사유"}\n문제: ${gen.question_text}\n${gen.examples ? `보기:\n${gen.examples}\n` : ''}정답: ${gen.answer}\n해설: ${gen.comment || ''}`;
    const r = await fetch('https://api.openai.com/v1/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` }, body: JSON.stringify({ model: 'gpt-4.1-mini', messages: [{ role: 'user', content: prompt }], response_format: { type: 'json_object' }, temperature: 0 }), signal: AbortSignal.timeout(T) });
    if (!r.ok) throw new Error(`answerCheck ${r.status}`); return JSON.parse((await r.json()).choices[0].message.content);
  });
}

// 님의 Langfuse 프롬프트 (최신 버전 — UI에서 수정하면 다음 실행에 반영)
const genPrompt = await lf.getPrompt('core-cbt/daily-review/generator', undefined, { label: 'latest', cacheTtlSeconds: 0 });
const judgePrompt = await lf.getPrompt('core-cbt/daily-review/judge', undefined, { label: 'latest', cacheTtlSeconds: 0 });
console.log(`Langfuse 프롬프트: generator v${genPrompt.version} · judge v${judgePrompt.version}\n`);

async function runArm(anchor, arm, ctx) {
  const reasons = [];
  let accepted = null;
  const trace = lf.trace({ name: 'generate-variant', metadata: { source: anchor.source, problem_no: anchor.problem_no, category: anchor.category, arm }, tags: [arm, anchor.category] });
  for (let attempt = 0; attempt <= MAX_REGEN; attempt += 1) {
    let input = genPrompt.compile({ concept: anchor.category, original_question: anchor.question_text, original_examples: anchor.examples || '없음', original_answer: anchor.answer, original_comment: anchor.comment || '없음', failure_reasons: reasons.length ? reasons.map((r) => `- ${r}`).join('\n') : '없음' });
    if (ctx) input += `\n\n[비슷한 기출 예시 — 스타일·난이도 참고]\n${ctx}`;
    const gspan = trace.generation({ name: `generator (attempt ${attempt})`, model: GEN_MODEL, input, prompt: genPrompt, metadata: { attempt_no: attempt, arm } });
    let res; try { res = await callResponses(GEN_MODEL, input, 1500); } catch (e) { gspan.end({ output: `ERROR ${e.message}` }); reasons.push('생성 오류'); continue; }
    gspan.end({ output: res.text, usage: res.usage });
    const gen = parseModelJson(res.text);
    if (!gen) { reasons.push('JSON 파싱 실패'); continue; }
    const gate = validateGeneratedProblem(gen, anchor);
    if (!gate.ok) { reasons.push(gate.reason); continue; }
    const jinput = judgePrompt.compile({ original_question: anchor.question_text, original_examples: anchor.examples || '없음', original_answer: anchor.answer, generated_question: gen.question_text, generated_examples: gen.examples || '없음', generated_answer: gen.answer, accepted_answers: (gen.accepted_answers || []).join(', ') });
    const jspan = trace.generation({ name: `judge (attempt ${attempt})`, model: judgeModelFor(anchor.category), input: jinput, prompt: judgePrompt, metadata: { attempt_no: attempt } });
    let verdict = null; try { const jr = await callResponses(judgeModelFor(anchor.category), jinput, 600); jspan.end({ output: jr.text }); verdict = parseModelJson(jr.text); } catch { jspan.end({ output: 'ERROR' }); }
    if (verdict && verdict.concept_same && verdict.answer_correct && verdict.no_leak && verdict.difficulty_ok) { accepted = gen; break; }
    reasons.push(`심판 반려: ${verdict?.reason || '판정 실패'}`);
  }
  // 점수 (Langfuse에 기록)
  if (accepted) {
    const rag = await ragScore(accepted, anchor.category);
    const ac = await answerCheck(accepted);
    const err = (rag < RAG_THRESHOLD || !ac.consistent || !ac.correct) ? 1 : 0;
    lf.score({ traceId: trace.id, name: 'rag_similarity', value: +rag.toFixed(3) });
    lf.score({ traceId: trace.id, name: 'answer_correct', value: ac.correct ? 1 : 0 });
    lf.score({ traceId: trace.id, name: 'answer_consistent', value: ac.consistent ? 1 : 0 });
    lf.score({ traceId: trace.id, name: 'error', value: err, comment: ac.reason });
    trace.update({ output: { status: 'accepted', rag, error: err } });
    return { accepted: true, err };
  }
  trace.update({ output: { status: 'rejected', failure_reasons: reasons } });
  lf.score({ traceId: trace.id, name: 'error', value: 1, comment: '채택 실패' });
  return { accepted: false, rejected: true };
}

const anchors = await sql`
  SELECT p.id, s.key AS source, p.problem_no, p.category, p.question_text, coalesce(p.examples,'') AS examples, p.answer, coalesce(p.comment,'') AS comment
  FROM practical_problems p JOIN sources s ON s.id = p.source_id
  WHERE p.answer_kind <> 'freeform' AND p.embedding IS NOT NULL ORDER BY random() LIMIT ${N}`;

let done = 0;
for (const a of anchors) {
  done += 1;
  try {
    const similar = await sql`SELECT p.question_text, p.answer FROM practical_problems p, (SELECT embedding FROM practical_problems WHERE id=${a.id}) anc WHERE p.id <> ${a.id} AND p.category=${a.category} AND p.embedding IS NOT NULL ORDER BY p.embedding <=> anc.embedding LIMIT 3`;
    const ctx = similar.map((s, i) => `예시${i + 1}) 문제: ${s.question_text}\n   정답: ${s.answer}`).join('\n');
    const A = await runArm(a, 'before', '');
    const B = await runArm(a, 'after', ctx);
    console.log(`${done}/${anchors.length} [${a.source}#${a.problem_no} ${a.category}] A:${A.accepted ? (A.err ? '채택⚠' : '채택') : '반려'} B:${B.accepted ? (B.err ? '채택⚠' : '채택') : '반려'}`);
  } catch (e) { console.log(`${done}/${anchors.length} [${a.source}#${a.problem_no}] 실패: ${String(e.message).slice(0, 50)}`); }
}
await lf.flushAsync();
await sql.end();
console.log('\n✅ Langfuse 전송 완료 — Traces에서 generator/judge 프롬프트·응답·점수 확인 (시간 필터 넓게)');
