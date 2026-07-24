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

// 일시적 오류(타임아웃·429·5xx)에 재시도
async function retry(fn, tries = 4, base = 2000) {
  let last;
  for (let i = 0; i < tries; i += 1) {
    try { return await fn(); } catch (e) { last = e; if (i < tries - 1) await new Promise((r) => setTimeout(r, base * (i + 1))); }
  }
  throw last;
}
const TIMEOUT = 150000;

async function callResponses(model, input, maxTokens) {
  return retry(async () => {
    const r = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` },
      body: JSON.stringify({ model, input, max_output_tokens: maxTokens }), signal: AbortSignal.timeout(TIMEOUT),
    });
    if (!r.ok) throw new Error(`openai ${model} ${r.status}`);
    const d = await r.json();
    return (d.output || []).flatMap((i) => i?.content || []).map((c) => c?.text || '').join('').trim();
  });
}
async function embed(text) {
  return retry(async () => {
    const r = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` },
      body: JSON.stringify({ model: 'text-embedding-3-small', input: [text] }), signal: AbortSignal.timeout(TIMEOUT),
    });
    if (!r.ok) throw new Error(`embed ${r.status}`);
    return (await r.json()).data[0].embedding;
  });
}
async function ragScore(gen, category) {
  const vec = `[${(await embed(`[${category}] ${gen.question_text}\n${gen.examples || ''}`.slice(0, 6000))).join(',')}]`;
  const rows = await sql`SELECT 1-(embedding <=> ${vec}::vector) AS sim FROM practical_problems
    WHERE embedding IS NOT NULL AND category=${category} ORDER BY embedding <=> ${vec}::vector LIMIT 1`;
  return rows[0] ? Number(rows[0].sim) : 0;
}
async function answerCheck(gen) {
  return retry(async () => {
    const prompt = `실기 문제의 정답·해설을 판정하라. JSON만: {"consistent":bool,"correct":bool,"reason":"짧은 사유"}
문제: ${gen.question_text}\n${gen.examples ? `보기:\n${gen.examples}\n` : ''}정답: ${gen.answer}\n해설: ${gen.comment || ''}`;
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` },
      body: JSON.stringify({ model: 'gpt-4.1-mini', messages: [{ role: 'user', content: prompt }], response_format: { type: 'json_object' }, temperature: 0 }), signal: AbortSignal.timeout(TIMEOUT),
    });
    if (!r.ok) throw new Error(`answerCheck ${r.status}`);
    return JSON.parse((await r.json()).choices[0].message.content);
  });
}

const slimGen = (g) => (g ? { question_text: g.question_text, examples: g.examples || '', answer: g.answer, comment: g.comment || '' } : null);
async function runArm(anchor, extraContext) {
  const original = { question_text: anchor.question_text, examples: anchor.examples, category: anchor.category, subcategory: '' };
  const reasons = [];
  const rejectedGens = []; // 반려된 생성물도 보존
  let accepted = null, attempts = 0, regen = 0;
  for (let attempt = 0; attempt <= MAX_REGEN; attempt += 1) {
    attempts += 1; if (attempt >= 1) regen += 1;
    let prompt = buildGeneratorPrompt({ original, answer: anchor.answer, comment: anchor.comment, concept: anchor.category, failureReasons: reasons });
    if (extraContext) prompt += `\n\n[비슷한 기출 예시 — 이 스타일·난이도를 참고해서 새로 만들 것]\n${extraContext}`;
    let gen = null;
    try { gen = parseModelJson(await callResponses(GEN_MODEL, prompt, 1500)); } catch { reasons.push('생성 오류'); continue; }
    if (!gen) { reasons.push('JSON 파싱 실패'); continue; }
    const gate = validateGeneratedProblem(gen, original);
    if (!gate.ok) { reasons.push(gate.reason); rejectedGens.push(slimGen(gen)); continue; }
    let verdict = null;
    try { verdict = parseModelJson(await callResponses(judgeModelFor(anchor.category), buildJudgePrompt({ gen, original, answer: anchor.answer }), 600)); } catch {}
    if (verdict && verdict.concept_same && verdict.answer_correct && verdict.no_leak && verdict.difficulty_ok) { accepted = gen; break; }
    reasons.push(`심판 반려: ${verdict?.reason || '판정 실패'}`);
    rejectedGens.push(slimGen(gen));
  }
  const out = { attempts, regenerated: regen > 0, accepted, failureReasons: reasons, rejectedGens };
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
const save = () => {
  const agg = (arm) => {
    const acc = results.filter((r) => r[arm].accepted).length;
    const regen = results.filter((r) => r[arm].regenerated).length;
    const err = results.filter((r) => r[arm].accepted && r[arm].flags?.length).length;
    return { accepted: acc, regenRate: results.length ? ((regen / results.length) * 100).toFixed(0) : '0', errRate: acc ? ((err / acc) * 100).toFixed(0) : '0' };
  };
  fs.writeFileSync(OUT, JSON.stringify({ summary: { n: results.length, A: agg('A'), B: agg('B') }, results }, null, 2));
};

let done = 0;
for (const a of anchors) {
  done += 1;
  try {
    const similar = await sql`
      SELECT p.question_text, p.answer FROM practical_problems p, (SELECT embedding FROM practical_problems WHERE id=${a.id}) anc
      WHERE p.id <> ${a.id} AND p.category=${a.category} AND p.embedding IS NOT NULL
      ORDER BY p.embedding <=> anc.embedding LIMIT 3`;
    const ctx = similar.map((s, i) => `예시${i + 1}) 문제: ${s.question_text}\n   정답: ${s.answer}`).join('\n');
    const A = await runArm(a, null);
    const B = await runArm(a, ctx);
    results.push({ anchor: { source: a.source, no: a.problem_no, category: a.category, question_text: a.question_text, examples: a.examples, answer: a.answer }, similar: similar.map((s) => s.question_text), A, B });
    save(); // 앵커마다 중간 저장 — 크래시해도 진행분 보존
    console.log(`${done}/${anchors.length} [${a.source}#${a.problem_no} ${a.category}] A:${A.accepted ? '채택' : '반려'}${A.flags?.length ? '⚠' : ''} B:${B.accepted ? '채택' : '반려'}${B.flags?.length ? '⚠' : ''}`);
  } catch (e) {
    console.log(`${done}/${anchors.length} [${a.source}#${a.problem_no}] 앵커 실패 — 스킵: ${String(e.message).slice(0, 60)}`);
  }
}

const s = JSON.parse(fs.readFileSync(OUT, 'utf8')).summary;
console.log(`\n=== 요약 (앵커 ${s.n}) ===`);
console.log(`방식 A: 채택 ${s.A.accepted} · 재생성률 ${s.A.regenRate}% · 오류율 ${s.A.errRate}%`);
console.log(`방식 B: 채택 ${s.B.accepted} · 재생성률 ${s.B.regenRate}% · 오류율 ${s.B.errRate}%`);
await sql.end();
