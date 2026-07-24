import 'dotenv/config';
import { sql } from '../db/client.js';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const MODEL = 'gpt-4.1-mini';
const LIMIT = Number(process.argv[2]) || 40;

const PROMPT = (p) => `다음은 정보처리 실기 문제와 저장된 정답·해설이다. 두 가지만 판정하라.

문제: ${p.question_text}
${p.examples ? `보기/코드:\n${p.examples}\n` : ''}저장된 정답: ${p.answer}
해설: ${p.comment}

판정:
1. consistent(A형): 해설이 설명하는 결론이 "저장된 정답"과 일치하는가? 해설이 다른 답을 가리키면 false. (동의어·표기차이는 일치로 본다)
2. correct(B형): 저장된 정답이 이 문제에 대해 실제로 옳은가?

반드시 JSON만 출력: {"consistent": true/false, "correct": true/false, "reason": "짧은 한국어 사유"}`;

async function judge(p) {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${OPENAI_API_KEY}` },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: 'user', content: PROMPT(p) }],
      response_format: { type: 'json_object' },
      temperature: 0,
    }),
  });
  if (!res.ok) throw new Error(`openai ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return { verdict: JSON.parse(data.choices[0].message.content), usage: data.usage };
}

const rows = await sql`
  SELECT s.key AS source, p.problem_no, p.category, p.answer_kind,
         p.question_text, coalesce(p.examples,'') AS examples, p.answer, coalesce(p.comment,'') AS comment
  FROM practical_problems p JOIN sources s ON s.id = p.source_id
  WHERE p.comment IS NOT NULL AND p.comment <> ''
  ORDER BY random() LIMIT ${LIMIT}`;

console.log(`실기 표본 ${rows.length}문항 검사 (모델 ${MODEL})\n`);
let aFail = [], bFail = [], tok = 0;
for (const p of rows) {
  try {
    const { verdict, usage } = await judge(p);
    tok += usage?.total_tokens || 0;
    if (!verdict.consistent) aFail.push({ p, r: verdict.reason });
    if (!verdict.correct) bFail.push({ p, r: verdict.reason });
  } catch (e) { console.log(`  [${p.source}#${p.problem_no}] 검사실패: ${e.message}`); }
}

console.log(`\n=== A형 (해설↔정답 불일치): ${aFail.length}건 ===`);
aFail.forEach(({ p, r }) => console.log(`  [${p.source}#${p.problem_no}] 정답="${String(p.answer).slice(0, 30)}" → ${r}`));
console.log(`\n=== B형 (정답 자체 오류 의심): ${bFail.length}건 ===`);
bFail.forEach(({ p, r }) => console.log(`  [${p.source}#${p.problem_no}] 정답="${String(p.answer).slice(0, 30)}" → ${r}`));
const cost = (tok / 1_000_000) * 0.6;
console.log(`\n토큰 ${tok.toLocaleString()} | 예상비용 ~$${cost.toFixed(4)} | 정상 ${rows.length - new Set([...aFail, ...bFail].map(x => x.p.problem_no)).size}/${rows.length}`);
await sql.end();
