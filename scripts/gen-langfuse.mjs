import dotenv from 'dotenv';
dotenv.config();
dotenv.config({ path: '.env.local' });
import { Langfuse } from 'langfuse';
import { sql } from '../db/client.js';
import { buildJudgePrompt, validateGeneratedProblem, parseModelJson } from '@/lib/variantGeneration';

const KEY = process.env.OPENAI_API_KEY;
const GEN_MODEL = 'gpt-4.1';
const MAX_REGEN = 2;
const N = Number(process.argv[2]) || 3;
const judgeModelFor = (c) => (c === 'Code' || c === 'SQL' ? 'gpt-4.1' : 'gpt-4.1-mini');

const lf = new Langfuse({
  secretKey: process.env.LANGFUSE_SECRET_KEY,
  publicKey: process.env.LANGFUSE_PUBLIC_KEY,
  baseUrl: process.env.LANGFUSE_BASE_URL,
});

async function callResponses(model, input, maxTokens) {
  const r = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` },
    body: JSON.stringify({ model, input, max_output_tokens: maxTokens }),
  });
  if (!r.ok) throw new Error(`openai ${model} ${r.status}`);
  const d = await r.json();
  const text = (d.output || []).flatMap((i) => i?.content || []).map((c) => c?.text || '').join('').trim();
  return { text, usage: d.usage };
}

// Langfuse에서 최신 프롬프트 가져오기 (UI에서 수정→저장하면 그 버전이 바로 반영됨)
const promptClient = await lf.getPrompt('practical-generator', undefined, { label: 'latest', cacheTtlSeconds: 0 });
console.log(`Langfuse 프롬프트 로드: practical-generator v${promptClient.version} (latest)\n`);

const anchors = await sql`
  SELECT p.id, s.key AS source, p.problem_no, p.category, p.question_text,
         coalesce(p.examples,'') AS examples, p.answer, coalesce(p.comment,'') AS comment
  FROM practical_problems p JOIN sources s ON s.id = p.source_id
  WHERE p.answer_kind <> 'freeform' AND p.embedding IS NOT NULL
  ORDER BY random() LIMIT ${N}`;

async function runArm(anchor, arm, extra) {
  const reasons = [];
  let accepted = null;
  const trace = lf.trace({
    name: 'generate-variant',
    metadata: { source: anchor.source, problem_no: anchor.problem_no, category: anchor.category, arm },
    tags: [arm, anchor.category],
  });
  for (let attempt = 0; attempt <= MAX_REGEN; attempt += 1) {
    const extraFull = [extra, reasons.length ? `\n[이전 실패 사유 — 해결할 것]\n${reasons.map((r) => `- ${r}`).join('\n')}` : ''].join('');
    const input = promptClient.compile({
      concept: anchor.category,
      original_question: anchor.question_text,
      original_examples: anchor.examples || '없음',
      original_answer: anchor.answer,
      original_comment: anchor.comment || '없음',
      extra: extraFull,
    });
    const gspan = trace.generation({ name: `generator (attempt ${attempt})`, model: GEN_MODEL, input, prompt: promptClient, metadata: { attempt_no: attempt, arm } });
    let genRes;
    try { genRes = await callResponses(GEN_MODEL, input, 1500); } catch (e) { gspan.end({ output: `ERROR: ${e.message}` }); reasons.push('생성 오류'); continue; }
    gspan.end({ output: genRes.text, usage: genRes.usage });
    const gen = parseModelJson(genRes.text);
    if (!gen) { reasons.push('JSON 파싱 실패'); continue; }
    const gate = validateGeneratedProblem(gen, anchor);
    if (!gate.ok) { reasons.push(gate.reason); continue; }
    const judgePrompt = buildJudgePrompt({ gen, original: anchor, answer: anchor.answer });
    const jspan = trace.generation({ name: `judge (attempt ${attempt})`, model: judgeModelFor(anchor.category), input: judgePrompt, metadata: { attempt_no: attempt } });
    let verdict = null;
    try { const jr = await callResponses(judgeModelFor(anchor.category), judgePrompt, 600); jspan.end({ output: jr.text }); verdict = parseModelJson(jr.text); } catch { jspan.end({ output: 'ERROR' }); }
    const pass = verdict && verdict.concept_same && verdict.answer_correct && verdict.no_leak && verdict.difficulty_ok;
    if (pass) { accepted = gen; trace.update({ output: { status: 'accepted', attempt_no: attempt } }); break; }
    reasons.push(`심판 반려: ${verdict?.reason || '판정 실패'}`);
  }
  if (!accepted) trace.update({ output: { status: 'rejected', failure_reasons: reasons } });
  return { accepted: !!accepted, attempts: reasons.length + (accepted ? 1 : 0), reasons };
}

for (const a of anchors) {
  const similar = await sql`
    SELECT p.question_text, p.answer FROM practical_problems p, (SELECT embedding FROM practical_problems WHERE id=${a.id}) anc
    WHERE p.id <> ${a.id} AND p.category=${a.category} AND p.embedding IS NOT NULL
    ORDER BY p.embedding <=> anc.embedding LIMIT 3`;
  const ctx = `\n[비슷한 기출 예시 — 스타일·난이도 참고]\n${similar.map((s, i) => `예시${i + 1}) 문제: ${s.question_text}\n   정답: ${s.answer}`).join('\n')}`;
  console.log(`[${a.source}#${a.problem_no} ${a.category}]`);
  const A = await runArm(a, 'before', '');
  console.log(`  A(본보기1): ${A.accepted ? '채택' : '반려'} (시도 ${A.attempts})`);
  const B = await runArm(a, 'after', ctx);
  console.log(`  B(RAG참고): ${B.accepted ? '채택' : '반려'} (시도 ${B.attempts})`);
}

await lf.flushAsync();
await sql.end();
console.log('\n✅ Langfuse에 전송 완료 — 대시보드 Traces에서 "generate-variant" 확인 (프롬프트·응답·심판 포함)');
