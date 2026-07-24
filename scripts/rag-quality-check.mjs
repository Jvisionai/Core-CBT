import 'dotenv/config';
import { sql } from '../db/client.js';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const EMBED_MODEL = 'text-embedding-3-small';

// 저장 임베딩과 같은 입력 포맷으로 맞춘다
const toInput = ({ category, questionText, examples }) =>
  `${category ? `[${category}] ` : ''}${questionText}\n${examples || ''}`.slice(0, 6000);

async function embed(texts) {
  const res = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${OPENAI_API_KEY}` },
    body: JSON.stringify({ model: EMBED_MODEL, input: texts }),
  });
  if (!res.ok) throw new Error(`openai ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.data.map((d) => d.embedding);
}

// 후보 텍스트가 기존 실제 문제들과 얼마나 닮았나 (1번 기준)
export async function scoreAgainstCorpus(vec, { category = null, excludeId = null, k = 3 } = {}) {
  const vecLit = `[${vec.join(',')}]`;
  const rows = await sql`
    SELECT category, question_text,
           1 - (embedding <=> ${vecLit}::vector) AS sim
    FROM practical_problems
    WHERE embedding IS NOT NULL
      ${category ? sql`AND category = ${category}` : sql``}
      ${excludeId ? sql`AND id <> ${excludeId}` : sql``}
    ORDER BY embedding <=> ${vecLit}::vector
    LIMIT ${k}`;
  return { top: rows[0] ? Number(rows[0].sim) : 0, neighbors: rows };
}

const THRESHOLD = 0.45; // 이 이상이면 "실제 문제 형태와 유사 = 통과"
const verdict = (s) => (s >= THRESHOLD ? '✅ 통과(형태 유사)' : '⚠️ 오탐 의심(이상치)');

// ---------- 판정기 검증 ----------
if (process.argv[1].endsWith('rag-quality-check.mjs')) {
  // 1) 실제 문제 하나 (자기 자신 제외하고 조회 → 진짜 held-out)
  const [real] = await sql`
    SELECT id, category, question_text AS "questionText", coalesce(examples,'') AS examples
    FROM practical_problems WHERE category='이론' AND embedding IS NOT NULL ORDER BY problem_no LIMIT 1`;

  const cases = [
    { label: '실제 기출(held-out)', category: real.category, text: toInput(real), excludeId: real.id },
    { label: '잘 만든 유사 문제(합성)', category: '이론', text: '[이론] 다음 설명에 해당하는 네트워크 계층 장비를 쓰시오.\n- OSI 3계층에서 동작하며 IP 주소를 보고 최적 경로로 패킷을 전달한다.\n- 서로 다른 네트워크를 연결한다.' },
    { label: '오탐: 주제 벗어난 문제', category: '이론', text: '[이론] 다음 중 김치찌개에 들어가는 재료로 옳은 것을 고르시오.\n김치, 돼지고기, 두부, 대파' },
    { label: '오탐: 문제 아닌 잡문', category: null, text: '오늘 날씨가 참 맑고 기분이 좋다. 점심을 먹고 산책을 했다.' },
  ];

  const vecs = await embed(cases.map((c) => c.text));
  console.log(`판정 임계값 ${THRESHOLD} (top-1 코사인 유사도)\n`);
  for (let i = 0; i < cases.length; i += 1) {
    const { top, neighbors } = await scoreAgainstCorpus(vecs[i], { category: cases[i].category, excludeId: cases[i].excludeId });
    console.log(`[${cases[i].label}]  top유사도 ${top.toFixed(3)}  ${verdict(top)}`);
    neighbors.slice(0, 2).forEach((n) => console.log(`     ↳ ${Number(n.sim).toFixed(3)}  ${String(n.question_text).slice(0, 40)}`));
  }
  await sql.end();
}
