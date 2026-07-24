import dotenv from 'dotenv';
dotenv.config();
dotenv.config({ path: '.env.local' });
import { Langfuse } from 'langfuse';
import { sql } from '../db/client.js';

const KEY = process.env.OPENAI_API_KEY;
const base = process.env.LANGFUSE_BASE_URL.replace(/\/$/, '');
const auth = 'Basic ' + Buffer.from(`${process.env.LANGFUSE_PUBLIC_KEY}:${process.env.LANGFUSE_SECRET_KEY}`).toString('base64');
const lf = new Langfuse({ secretKey: process.env.LANGFUSE_SECRET_KEY, publicKey: process.env.LANGFUSE_PUBLIC_KEY, baseUrl: process.env.LANGFUSE_BASE_URL });
const RAG_THRESHOLD = 0.45;

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
  const prompt = `실기 문제 정답·해설 판정. JSON만: {"consistent":bool,"correct":bool,"reason":"짧은 사유"}
문제: ${gen.question_text}\n${gen.examples ? `보기:\n${gen.examples}\n` : ''}정답: ${gen.answer}\n해설: ${gen.comment || ''}`;
  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` },
    body: JSON.stringify({ model: 'gpt-4.1-mini', messages: [{ role: 'user', content: prompt }], response_format: { type: 'json_object' }, temperature: 0 }),
  });
  return JSON.parse((await r.json()).choices[0].message.content);
}
const parse = (t) => { try { const s = String(t).indexOf('{'), e = String(t).lastIndexOf('}'); return JSON.parse(String(t).slice(s, e + 1)); } catch { return null; } };

// generate-variant 트레이스 목록
const list = await (await fetch(`${base}/api/public/traces?name=generate-variant&limit=20`, { headers: { Authorization: auth } })).json();
console.log(`대상 트레이스 ${list.data.length}개\n`);

let scored = 0;
for (const t of list.data) {
  const full = await (await fetch(`${base}/api/public/traces/${t.id}`, { headers: { Authorization: auth } })).json();
  const category = t.metadata?.category || 'Code';
  const arm = t.metadata?.arm || '?';
  // 채택된 attempt의 generator 출력 (Langfuse가 객체로 저장하기도, 문자열이기도)
  const acceptedAttempt = full.output?.attempt_no;
  const asObj = (o) => (o && typeof o === 'object' ? o : parse(o));
  const genObs = (full.observations || []).filter((o) => (o.name || '').startsWith('generator'));
  let problem = null;
  for (const o of genObs) {
    const p = asObj(o.output);
    if (p && p.question_text && p.answer) {
      if (o.name === `generator (attempt ${acceptedAttempt})`) { problem = p; break; }
      problem = p; // 폴백: 마지막 유효 생성물
    }
  }
  if (!problem) { console.log(`  [${arm} ${category}] 채택 문제 없음(반려) — 스킵`); continue; }

  const rag = await ragScore(problem, category);
  const ac = await answerCheck(problem);
  const errorFlag = (rag < RAG_THRESHOLD || !ac.consistent || !ac.correct) ? 1 : 0;

  await lf.score({ traceId: t.id, name: 'rag_similarity', value: Number(rag.toFixed(3)) });
  await lf.score({ traceId: t.id, name: 'answer_consistent', value: ac.consistent ? 1 : 0 });
  await lf.score({ traceId: t.id, name: 'answer_correct', value: ac.correct ? 1 : 0 });
  await lf.score({ traceId: t.id, name: 'error', value: errorFlag, comment: ac.reason });
  scored += 1;
  console.log(`  [${arm} ${category}] RAG ${rag.toFixed(3)} · 해설일치 ${ac.consistent ? 'O' : 'X'} · 정답 ${ac.correct ? 'O' : 'X'} · 오류 ${errorFlag ? '⚠' : '없음'}`);
}
await lf.flushAsync();
await sql.end();
console.log(`\n✅ ${scored}개 트레이스에 점수 부착 완료 — Langfuse Traces에서 Scores 열, 또는 Dashboard에서 점수별 비교 가능`);
