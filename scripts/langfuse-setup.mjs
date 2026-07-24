import dotenv from 'dotenv';
dotenv.config();                       // .env (OPENAI, DB)
dotenv.config({ path: '.env.local' }); // .env.local (LANGFUSE, OPENROUTER)
import { Langfuse } from 'langfuse';

const lf = new Langfuse({
  secretKey: process.env.LANGFUSE_SECRET_KEY,
  publicKey: process.env.LANGFUSE_PUBLIC_KEY,
  baseUrl: process.env.LANGFUSE_BASE_URL,
});

// Langfuse에서 관리할 생성 프롬프트 (UI에서 이 이름으로 수정 가능)
const template = `당신은 정보처리산업기사 실기 문제 출제자입니다. 아래 원본 문제의 "변형"을 1개 만드세요.

규칙:
- 측정 개념({{concept}})은 반드시 유지
- 표면(테이블명·값·소재)과 구조(함수·조건)는 다양하게 변경 — 원본을 외운 사람이 못 풀고 개념을 아는 사람만 풀 수 있게
- 난이도는 원본과 동급 (더 쉽게 만들지 말 것)
- 정답이 문제 본문이나 보기에 절대 드러나지 않게
- 정답(answer, accepted_answers)은 줄바꿈 없는 한 줄
- accepted_answers는 정답과 의미가 완전히 같은 표기만 허용

아래 JSON 형식으로만 출력 (설명 금지):
{"question_text":"...","examples":"...(없으면 빈 문자열)","input_type":"single","category":"...","subcategory":"...","answer":"...","accepted_answers":["...","동의어"],"comment":"왜 이 답인지 1~3문장"}

[원본 문제]
{{original_question}}
[원본 보기/코드]
{{original_examples}}
[원본 정답] {{original_answer}}
[원본 해설]
{{original_comment}}
{{extra}}`;

await lf.createPrompt({ name: 'practical-generator', type: 'text', prompt: template, labels: ['production'] });
const p = await lf.getPrompt('practical-generator');
console.log('✅ 프롬프트 생성+조회 OK — 이름 practical-generator, 버전', p.version);

const compiled = p.compile({ concept: '스케줄링', original_question: 'Q예시', original_examples: 'E예시', original_answer: 'A', original_comment: 'C', extra: '' });
console.log('✅ 컴파일 OK — 길이', compiled.length);

const trace = lf.trace({ name: 'connectivity-test', metadata: { purpose: 'setup' } });
trace.event({ name: 'ping' });
await lf.flushAsync();
console.log('✅ 트레이스 flush OK — 대시보드에 connectivity-test 뜨면 연결 성공');
