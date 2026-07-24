import 'dotenv/config';
import { sql } from '../db/client.js';
import {
  buildGeneratorPrompt, buildJudgePrompt, validateGeneratedProblem, parseModelJson,
} from '@/lib/variantGeneration';

const KEY = process.env.OPENAI_API_KEY;
const GEN_MODEL = 'gpt-4.1';
const MAX_REGEN = 2;                 // 최초 1 + 재생성 2
const N = Number(process.argv[2]) || 3;
const RUN = 'baseline-openai';
const RAG_THRESHOLD = 0.45;
const judgeModelFor = (c) => (c === 'Code' || c === 'SQL' ? 'gpt-4.1' : 'gpt-4.1-mini');

async function callResponses(model, input, maxTokens) {
  const r = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` },
    body: JSON.stringify({ model, input, max_output_tokens: maxTokens }),
  });
  if (!r.ok) throw new Error(`openai ${model} ${r.status}`);
  const d = await r.json();
  return (d.output || []).flatMap((i) => i?.content || []).map((c) => c?.text || '').join('').trim();
}

async function embed(text) {
  const r = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` },
    body: JSON.stringify({ model: 'text-embedding-3-small', input: [text] }),
  });
  const d = await r.json();
  return d.data[0].embedding;
}

async function ragScore(gen, category) {
  const vec = `[${(await embed(`[${category}] ${gen.question_text}\n${gen.examples || ''}`.slice(0, 6000))).join(',')}]`;
  const rows = await sql`
    SELECT 1 - (embedding <=> ${vec}::vector) AS sim FROM practical_problems
    WHERE embedding IS NOT NULL AND category = ${category}
    ORDER BY embedding <=> ${vec}::vector LIMIT 1`;
  return rows[0] ? Number(rows[0].sim) : 0;
}

async function answerCheck(gen) {
  const prompt = `실기 문제의 정답·해설을 판정하라. JSON만: {"consistent":bool,"correct":bool,"reason":"짧은 사유"}
문제: ${gen.question_text}
${gen.examples ? `보기:\n${gen.examples}\n` : ''}정답: ${gen.answer}
해설: ${gen.comment || ''}`;
  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` },
    body: JSON.stringify({ model: 'gpt-4.1-mini', messages: [{ role: 'user', content: prompt }], response_format: { type: 'json_object' }, temperature: 0 }),
  });
  const d = await r.json();
  return JSON.parse(d.choices[0].message.content);
}

// 기록 테이블
await sql`CREATE TABLE IF NOT EXISTS ai_gen_attempts (
  id uuid primary key default gen_random_uuid(),
  run_label text, source_key text, source_no int, arm text,
  attempt_no int, status text, rag_score numeric, rag_pass boolean,
  ans_consistent boolean, ans_correct boolean, error_flags jsonb,
  failure_reason text, created_at timestamptz default now())`;

const anchors = await sql`
  SELECT s.key AS source, p.problem_no, p.category, p.question_text, coalesce(p.examples,'') AS examples,
         p.answer, coalesce(p.comment,'') AS comment
  FROM practical_problems p JOIN sources s ON s.id = p.source_id
  WHERE p.answer_kind <> 'freeform' ORDER BY random() LIMIT ${N}`;

console.log(`baseline 생성 — 앵커 ${anchors.length}개 (모델 ${GEN_MODEL})\n`);
let regenCalls = 0, acceptedCount = 0, errorCount = 0, totalAttempts = 0;

for (const a of anchors) {
  const original = { question_text: a.question_text, examples: a.examples, category: a.category, subcategory: '' };
  const reasons = [];
  let accepted = null;
  for (let attempt = 0; attempt <= MAX_REGEN; attempt += 1) {
    totalAttempts += 1;
    if (attempt >= 1) regenCalls += 1;
    let status = 'rejected', failure = null;
    let gen = null;
    try {
      gen = parseModelJson(await callResponses(GEN_MODEL, buildGeneratorPrompt({ original, answer: a.answer, comment: a.comment, concept: a.category, failureReasons: reasons }), 1500));
    } catch (e) { status = 'error'; failure = String(e.message); }
    if (gen) {
      const gate = validateGeneratedProblem(gen, original);
      if (!gate.ok) { failure = `gate: ${gate.reason}`; reasons.push(gate.reason); }
      else {
        let verdict = null;
        try { verdict = parseModelJson(await callResponses(judgeModelFor(a.category), buildJudgePrompt({ gen, original, answer: a.answer }), 600)); } catch {}
        const pass = verdict && verdict.concept_same && verdict.answer_correct && verdict.no_leak && verdict.difficulty_ok;
        if (pass) { status = 'accepted'; accepted = gen; }
        else { failure = `judge: ${verdict?.reason || 'unparsable'}`; reasons.push(failure); }
      }
    } else if (status !== 'error') { failure = 'invalid JSON'; reasons.push(failure); }

    await sql`INSERT INTO ai_gen_attempts (run_label, source_key, source_no, arm, attempt_no, status, failure_reason)
      VALUES (${RUN}, ${a.source}, ${a.problem_no}, 'before', ${attempt}, ${status}, ${failure})`;
    console.log(`  [${a.source}#${a.problem_no} ${a.category}] attempt ${attempt}: ${status}${failure ? ` (${failure.slice(0, 50)})` : ''}`);
    if (status === 'accepted') break;
  }

  if (accepted) {
    acceptedCount += 1;
    const rag = await ragScore(accepted, a.category);
    const ac = await answerCheck(accepted);
    const flags = [];
    if (rag < RAG_THRESHOLD) flags.push('유형벗어남');
    if (!ac.consistent) flags.push('해설불일치(A)');
    if (!ac.correct) flags.push('정답오류(B)');
    if (flags.length) errorCount += 1;
    await sql`UPDATE ai_gen_attempts SET rag_score=${rag}, rag_pass=${rag >= RAG_THRESHOLD},
      ans_consistent=${ac.consistent}, ans_correct=${ac.correct}, error_flags=${JSON.stringify(flags)}
      WHERE run_label=${RUN} AND source_key=${a.source} AND source_no=${a.problem_no} AND status='accepted'`;
    console.log(`     → 채택 · RAG ${rag.toFixed(3)} · 오류검출 ${flags.length ? flags.join(',') : '없음'}`);
  }
}

const regenRate = ((regenCalls / anchors.length) * 100).toFixed(1);
const errRate = acceptedCount ? ((errorCount / acceptedCount) * 100).toFixed(1) : '—';
console.log(`\n=== 결과 (${RUN}) ===`);
console.log(`앵커 ${anchors.length} | 총 생성호출 ${totalAttempts} | 채택 ${acceptedCount} | 반려 ${anchors.length - acceptedCount}`);
console.log(`재생성률 ${regenRate}% (재생성 호출 ${regenCalls} / 앵커 ${anchors.length})`);
console.log(`오류탐지율 ${errRate}% (오류검출 ${errorCount} / 채택 ${acceptedCount})`);
await sql.end();
