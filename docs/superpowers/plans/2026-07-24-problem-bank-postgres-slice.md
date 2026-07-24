# 문제 은행 Postgres 이전 — practical-industrial 수직 슬라이스 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 실기(practical-industrial) 250여 문항을 Postgres로 시드하고, 두 이전 리스크(식별자 재연결·채점 패리티)를 이 슬라이스에서 증명한다.

**Architecture:** 로컬 OrbStack(Docker) Postgres+pgvector에 Drizzle ORM으로 `sources`/`practical_problems`/`problem_choices` 스키마를 만든다. 순수 함수 `deriveAnswerModel`이 원본 `input_type` 대신 신호로 `answer_kind`·`match_mode`를 유도한다. 시드 스크립트가 기존 `PRACTICAL_SESSION_CONFIG`+`loadPracticalDatasetMaps`를 재사용해 upsert한다. 검증은 vitest 테스트로 (1) 모든 실기 outcome의 `(source_session_id, source_problem_number)`가 시드된 문제로 해석되는지, (2) 기존 `gradePracticalAnswer`와 새 구조 채점의 판정이 동일한지 확인한다.

**Tech Stack:** PostgreSQL 16 + pgvector, Drizzle ORM, postgres.js 드라이버, vitest, Docker(OrbStack).

**Spec:** `docs/superpowers/specs/2026-07-24-problem-bank-postgres-migration-design.md`

---

## File Structure

- Create: `docker-compose.yml` — 로컬 Postgres+pgvector 컨테이너
- Create: `drizzle.config.js` — Drizzle Kit 설정
- Create: `db/schema.js` — Drizzle 테이블 정의 (sources, practical_problems, problem_choices)
- Create: `db/client.js` — postgres.js 연결 + drizzle 인스턴스
- Create: `lib/migration/deriveAnswerModel.js` — answer_kind·match_mode·구조필드 유도 (순수 함수)
- Create: `tests/migration/deriveAnswerModel.test.js` — 유도 함수 단위 테스트
- Create: `scripts/seed-practical.mjs` — 실기 시드 스크립트
- Create: `tests/migration/grading-parity.test.js` — 채점 패리티 검증
- Create: `scripts/verify-identity.mjs` — outcome 재연결 검증
- Modify: `package.json` — deps + scripts
- Modify: `.env` — `DATABASE_URL` 추가 (로컬 Postgres)

---

## Task 0: 로컬 Postgres + pgvector 기동

**Files:**
- Create: `docker-compose.yml`
- Modify: `.env`

- [ ] **Step 1: docker-compose.yml 작성**

```yaml
services:
  db:
    image: pgvector/pgvector:pg16
    container_name: cbt_pg
    environment:
      POSTGRES_USER: cbt
      POSTGRES_PASSWORD: cbt
      POSTGRES_DB: cbt
    ports:
      - "5433:5432"
    volumes:
      - cbt_pgdata:/var/lib/postgresql/data
volumes:
  cbt_pgdata:
```

- [ ] **Step 2: 컨테이너 기동**

Run: `docker compose up -d`
Expected: `cbt_pg` 컨테이너 Started. (OrbStack이 Docker 소켓 제공)

- [ ] **Step 3: pgvector 확장 설치 확인**

Run: `docker exec cbt_pg psql -U cbt -d cbt -c "CREATE EXTENSION IF NOT EXISTS vector; SELECT extname FROM pg_extension WHERE extname='vector';"`
Expected: `vector` 한 행 출력

- [ ] **Step 4: .env에 연결 문자열 추가**

`.env`에 아래 줄 추가:
```
DATABASE_URL=postgres://cbt:cbt@localhost:5433/cbt
```

- [ ] **Step 5: 커밋**

```bash
git add docker-compose.yml
git commit -m "chore(db): 로컬 Postgres+pgvector docker-compose"
```

---

## Task 1: Drizzle + 드라이버 설치

**Files:**
- Modify: `package.json`
- Create: `drizzle.config.js`

- [ ] **Step 1: 의존성 설치**

Run: `npm install drizzle-orm postgres && npm install -D drizzle-kit`
Expected: 3개 패키지 추가, 에러 없음

- [ ] **Step 2: package.json scripts 추가**

`package.json`의 `scripts`에 추가:
```json
"db:generate": "drizzle-kit generate",
"db:migrate": "drizzle-kit migrate",
"db:seed:practical": "node scripts/seed-practical.mjs",
"db:verify:identity": "node scripts/verify-identity.mjs"
```

- [ ] **Step 3: drizzle.config.js 작성**

```javascript
import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './db/schema.js',
  out: './db/migrations',
  dialect: 'postgresql',
  dbCredentials: { url: process.env.DATABASE_URL },
});
```

- [ ] **Step 4: dotenv 확인**

Run: `node -e "require('dotenv')" && echo OK`
Expected: `OK` (없으면 `npm install dotenv`)

- [ ] **Step 5: 커밋**

```bash
git add package.json package-lock.json drizzle.config.js
git commit -m "chore(db): drizzle-orm + postgres 드라이버 + drizzle.config"
```

---

## Task 2: Drizzle 스키마 + 마이그레이션

**Files:**
- Create: `db/schema.js`
- Create: `db/client.js`

- [ ] **Step 1: db/schema.js 작성**

```javascript
import { pgTable, uuid, text, integer, jsonb, unique } from 'drizzle-orm/pg-core';

export const sources = pgTable('sources', {
  id: uuid('id').defaultRandom().primaryKey(),
  key: text('key').notNull().unique(),        // 레거시 source_session_id 보존
  title: text('title').notNull(),
  examType: text('exam_type').notNull(),        // written | practical | sqld | aiprompt
  kind: text('kind').notNull(),                 // practical_industrial | gichul | ...
});

export const practicalProblems = pgTable('practical_problems', {
  id: uuid('id').defaultRandom().primaryKey(),
  sourceId: uuid('source_id').notNull().references(() => sources.id),
  problemNo: integer('problem_no').notNull(),
  category: text('category'),                    // 이론 | Code | SQL
  answerKind: text('answer_kind').notNull(),     // single|sequence|set|multi_blank|freeform
  matchMode: text('match_mode').notNull(),       // normalized|exact|judge
  questionText: text('question_text').notNull(),
  examples: text('examples'),
  answer: text('answer').notNull(),
  acceptedAnswers: text('accepted_answers').array(),
  answerTokens: text('answer_tokens').array(),
  answerBlanks: jsonb('answer_blanks'),
  answerFormatHint: text('answer_format_hint'),
  inputType: text('input_type'),                 // 원본 보존
  comment: text('comment'),
  hint: text('hint'),
}, (t) => ({ uq: unique().on(t.sourceId, t.problemNo) }));

export const problemChoices = pgTable('problem_choices', {
  id: uuid('id').defaultRandom().primaryKey(),
  problemId: uuid('problem_id').notNull().references(() => practicalProblems.id),
  marker: text('marker').notNull(),
  text: text('text').notNull(),
  ordinal: integer('ordinal').notNull(),
});
```

- [ ] **Step 2: db/client.js 작성**

```javascript
import 'dotenv/config';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from './schema.js';

const sql = postgres(process.env.DATABASE_URL, { max: 4 });
export const db = drizzle(sql, { schema });
export { sql, schema };
```

- [ ] **Step 3: 마이그레이션 생성**

Run: `npm run db:generate`
Expected: `db/migrations/0000_*.sql` 생성 (순수 SQL — 열어서 CREATE TABLE 확인)

- [ ] **Step 4: 마이그레이션 적용**

Run: `npm run db:migrate`
Expected: 3개 테이블 생성. 확인: `docker exec cbt_pg psql -U cbt -d cbt -c "\dt"` → sources/practical_problems/problem_choices

- [ ] **Step 5: 커밋**

```bash
git add db/schema.js db/client.js db/migrations
git commit -m "feat(db): sources/practical_problems/problem_choices 스키마 + 마이그레이션"
```

---

## Task 3: answer_kind / match_mode 유도 함수 (TDD)

원본 `input_type`을 신뢰하지 않고 질문·정답 신호로 유도한다. 스펙 §3.3·§4 기준.

**Files:**
- Create: `lib/migration/deriveAnswerModel.js`
- Test: `tests/migration/deriveAnswerModel.test.js`

- [ ] **Step 1: 실패하는 테스트 작성**

```javascript
// tests/migration/deriveAnswerModel.test.js
import { describe, it, expect } from 'vitest';
import { deriveAnswerModel } from '@/lib/migration/deriveAnswerModel';

const P = (over) => ({ input_type: '', question_text: '', examples: '', ...over });

describe('deriveAnswerModel', () => {
  it('단답 → single/normalized', () => {
    const r = deriveAnswerModel(P({ input_type: 'single' }), 'NAT');
    expect(r.answerKind).toBe('single');
    expect(r.matchMode).toBe('normalized');
  });
  it('이진수 단답 → exact (앞자리 0 보존)', () => {
    const r = deriveAnswerModel(P({ input_type: 'single' }), '00001011');
    expect(r.matchMode).toBe('exact');
  });
  it('여러 줄 코드 출력 → exact', () => {
    const r = deriveAnswerModel(P({ input_type: 'single' }), '123\n 45\n  6');
    expect(r.matchMode).toBe('exact');
  });
  it('모두 고르기(잘못 태깅된 single) → set', () => {
    const r = deriveAnswerModel(P({ input_type: 'single', question_text: '옳은 것을 모두 고르시오' }), 'ㄱ, ㄷ, ㄹ, ㅁ, ㅂ');
    expect(r.answerKind).toBe('set');
    expect(r.answerTokens).toEqual(['ㄱ', 'ㄷ', 'ㄹ', 'ㅁ', 'ㅂ']);
  });
  it('순서 나열 → sequence, 토큰 순서 유지', () => {
    const r = deriveAnswerModel(P({ input_type: 'sequence', question_text: '순서대로 나열하시오' }), 'ㄹ -> ㄷ -> ㄴ -> ㄱ');
    expect(r.answerKind).toBe('sequence');
    expect(r.answerTokens).toEqual(['ㄹ', 'ㄷ', 'ㄴ', 'ㄱ']);
  });
  it('라벨 빈칸 → multi_blank, blanks 길이=빈칸수', () => {
    const r = deriveAnswerModel(P({ input_type: 'multi_blank' }), '① GRANT ② ON ③ TO');
    expect(r.answerKind).toBe('multi_blank');
    expect(r.answerBlanks).toHaveLength(3);
    expect(r.answerBlanks[0]).toEqual({ ordinal: 0, label: '①', value: 'GRANT' });
  });
  it('SQL 작성 → freeform/judge', () => {
    const r = deriveAnswerModel(P({ input_type: 'textarea', category: 'SQL' }), 'SELECT DISTINCT 과목 FROM 학생 WHERE 학년 >= 3;');
    expect(r.answerKind).toBe('freeform');
    expect(r.matchMode).toBe('judge');
  });
  it('배열 정답 → accepted_answers 전개', () => {
    const r = deriveAnswerModel(P({ input_type: 'single' }), ['형상 관리', '형상관리']);
    expect(r.answer).toBe('형상 관리');
    expect(r.acceptedAnswers).toEqual(['형상 관리', '형상관리']);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run tests/migration/deriveAnswerModel.test.js`
Expected: FAIL — "deriveAnswerModel is not a function"

- [ ] **Step 3: 구현 작성**

```javascript
// lib/migration/deriveAnswerModel.js
const S = (v) => (Array.isArray(v) ? String(v[0] ?? '') : String(v ?? ''));

function tokenize(ans) {
  return String(ans).split(/\s*(?:->|→|,|-|\s)\s*/).map((s) => s.trim()).filter(Boolean);
}

function parseBlanks(ans) {
  const parts = ans.includes('/') ? ans.split('/') : ans.split(/\s*,\s*/);
  const out = [];
  let ordinal = 0;
  for (const partRaw of parts) {
    const part = partRaw.trim();
    // 라벨: (가) / 1. / 1) / ① / ㄱ:  뒤에 값 (①②는 공백 구분도 허용)
    const m = part.match(/^\s*(\([가-힣ㄱ-ㅎ\d]+\)|[①-⑳]|\d+[.):]|[ㄱ-ㅎ][:：])\s*(.+)$/);
    if (m) { out.push({ ordinal: ordinal++, label: m[1].replace(/[.)]/g, '').trim(), value: m[2].trim() }); continue; }
    // ①②가 한 파트 안에 여러 개 ("① GRANT ② ON ③ TO")
    const multi = [...part.matchAll(/([①-⑳])\s*([^\s①-⑳][^①-⑳]*)/g)];
    if (multi.length >= 2) { multi.forEach((mm) => out.push({ ordinal: ordinal++, label: mm[1], value: mm[2].trim() })); continue; }
    return null;
  }
  return out.length >= 2 ? out : null;
}

function isExactMode(ans) {
  if (/\n/.test(ans)) return true;                 // 여러 줄 출력
  if (/^\s+\S/m.test(ans) || /\S  +\S/.test(ans)) return true; // 앞공백·이중공백 의미
  if (/^[01]{4,}$/.test(ans.trim())) return true;  // 이진수
  if (/^\d+\.\d*0$/.test(ans.trim())) return true; // 소수점 끝 0
  return false;
}

export function deriveAnswerModel(problem, correctAnswer) {
  const it = String(problem?.input_type || '');
  const q = S(problem?.question_text);
  const category = String(problem?.category || '');
  const isArray = Array.isArray(correctAnswer);
  const answer = S(correctAnswer);
  const acceptedAnswers = isArray ? correctAnswer.map((a) => String(a)) : null;

  const result = { answer, acceptedAnswers, answerTokens: null, answerBlanks: null };

  const selectAll = /모두\s*(고르|골라|쓰)/.test(q);
  const isSeq = it === 'sequence' || it === 'ordered_sequence' || /나열|순서/.test(q) || /(->|→)/.test(answer);
  const blanks = parseBlanks(answer);

  if (it === 'multi_blank' || (blanks && !isSeq && !selectAll)) {
    result.answerKind = 'multi_blank';
    result.answerBlanks = blanks;
    result.matchMode = isExactMode(answer) ? 'exact' : 'normalized';
    return result;
  }
  if (it === 'textarea' || /;\s*$/.test(answer) || category === 'SQL' && /\b(SELECT|UPDATE|INSERT|DELETE|CREATE|ALTER|GRANT)\b/i.test(answer)) {
    result.answerKind = 'freeform';
    result.matchMode = 'judge';
    return result;
  }
  if (isSeq) {
    result.answerKind = 'sequence';
    result.answerTokens = tokenize(answer);
    result.matchMode = isExactMode(answer) ? 'exact' : 'normalized';
    return result;
  }
  if (it === 'unordered_symbol_set' || (selectAll && /[ㄱ-ㅎ①-⑳]/.test(answer))) {
    result.answerKind = 'set';
    result.answerTokens = tokenize(answer);
    result.matchMode = 'normalized';
    return result;
  }
  result.answerKind = 'single';
  result.matchMode = isExactMode(answer) ? 'exact' : 'normalized';
  return result;
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run tests/migration/deriveAnswerModel.test.js`
Expected: PASS (8 tests)

- [ ] **Step 5: 전체 데이터 애매건 리포트 (수동검토 대상 노출)**

Run: `node -e "import('./lib/migration/deriveAnswerModel.js').then(async(m)=>{const {loadPracticalDatasetMaps}=await import('./app/practical/_lib/practicalData.js');const {PRACTICAL_SESSION_CONFIG}=await import('./app/practical/_lib/practicalSessions.js');let amb=[];for(const key of Object.keys(PRACTICAL_SESSION_CONFIG)){const ds=await loadPracticalDatasetMaps(key);for(const [no,p] of ds.problemsByNo){const ans=ds.answersByNo.get(no);const r=m.deriveAnswerModel(p,ans);if(r.answerKind==='single'&&/[,\/]/.test(String(ans))&&/[ㄱ-ㅎ①-⑳]/.test(String(ans)))amb.push(key+'#'+no+' '+JSON.stringify(ans).slice(0,40));}}console.log('수동검토 후보:',amb.length);amb.forEach(x=>console.log(' ',x));})"`
Expected: 후보 목록 출력 (스펙 예상 7~11건). 목록을 `docs/superpowers/plans/` 옆 메모로 남긴다.

- [ ] **Step 6: 커밋**

```bash
git add lib/migration/deriveAnswerModel.js tests/migration/deriveAnswerModel.test.js
git commit -m "feat(migration): answer_kind/match_mode 유도 함수 + 단위테스트"
```

---

## Task 4: 실기 시드 스크립트

기존 `PRACTICAL_SESSION_CONFIG`(슬러그→폴더)와 `loadPracticalDatasetMaps`를 재사용한다. `sources.key`는 슬러그 그대로 → outcome의 `source_session_id`와 일치(리스크 1 해소).

**Files:**
- Create: `scripts/seed-practical.mjs`

- [ ] **Step 1: 시드 스크립트 작성**

```javascript
// scripts/seed-practical.mjs
import 'dotenv/config';
import { db, sql, schema } from '../db/client.js';
import { eq } from 'drizzle-orm';
import { loadPracticalDatasetMaps } from '../app/practical/_lib/practicalData.js';
import { PRACTICAL_SESSION_CONFIG } from '../app/practical/_lib/practicalSessions.js';
import { deriveAnswerModel } from '../lib/migration/deriveAnswerModel.js';

const parseChoices = (examples) => {
  const items = [];
  String(examples || '').split(/\r?\n/).forEach((line) => {
    const m = line.match(/^\s*([ㄱ-ㅎ]|[①-⑳]|\d+)\s*[.):]\s*(.+)$/);
    if (m) items.push({ marker: m[1], text: m[2].trim(), ordinal: items.length });
  });
  return items;
};

let sourcesN = 0, problemsN = 0, choicesN = 0;
for (const [key, cfg] of Object.entries(PRACTICAL_SESSION_CONFIG)) {
  const [srcRow] = await db.insert(schema.sources)
    .values({ key, title: cfg.title, examType: 'practical', kind: 'practical_industrial' })
    .onConflictDoUpdate({ target: schema.sources.key, set: { title: cfg.title } })
    .returning();
  sourcesN += 1;

  const ds = await loadPracticalDatasetMaps(key);
  for (const [no, problem] of ds.problemsByNo) {
    const rawAnswer = ds.answersByNo.get(no);
    const model = deriveAnswerModel(problem, rawAnswer);
    const [prob] = await db.insert(schema.practicalProblems)
      .values({
        sourceId: srcRow.id, problemNo: Number(no),
        category: problem.category || null,
        answerKind: model.answerKind, matchMode: model.matchMode,
        questionText: String(problem.question_text || ''),
        examples: problem.examples ? String(problem.examples) : null,
        answer: model.answer,
        acceptedAnswers: model.acceptedAnswers,
        answerTokens: model.answerTokens,
        answerBlanks: model.answerBlanks,
        answerFormatHint: problem.answer_format_hint || null,
        inputType: problem.input_type || null,
        comment: ds.commentsByNo.get(no) || null,
        hint: problem.hint_body || null,
      })
      .onConflictDoUpdate({
        target: [schema.practicalProblems.sourceId, schema.practicalProblems.problemNo],
        set: { answerKind: model.answerKind, matchMode: model.matchMode, answer: model.answer },
      })
      .returning();
    problemsN += 1;

    if (model.answerKind === 'sequence' || model.answerKind === 'set') {
      await db.delete(schema.problemChoices).where(eq(schema.problemChoices.problemId, prob.id));
      const choices = parseChoices(problem.examples);
      if (choices.length) {
        await db.insert(schema.problemChoices).values(choices.map((c) => ({ problemId: prob.id, ...c })));
        choicesN += choices.length;
      }
    }
  }
}
console.log(`시드 완료 — sources ${sourcesN}, problems ${problemsN}, choices ${choicesN}`);
await sql.end();
```

- [ ] **Step 2: 시드 실행**

Run: `npm run db:seed:practical`
Expected: `시드 완료 — sources 13, problems 250, choices N`

- [ ] **Step 3: 저장 결과 확인**

Run: `docker exec cbt_pg psql -U cbt -d cbt -c "SELECT answer_kind, count(*) FROM practical_problems GROUP BY answer_kind ORDER BY 2 DESC;"`
Expected: single ~165, multi_blank ~66, set ~7, sequence ~6, freeform ~6 (스펙 분포와 근사)

- [ ] **Step 4: 커밋**

```bash
git add scripts/seed-practical.mjs
git commit -m "feat(migration): 실기 시드 스크립트 (config+loader 재사용, upsert)"
```

---

## Task 5: 검증 1 — outcome 재연결 (리스크 1)

모든 실기 outcome의 `(source_session_id, source_problem_number)`가 시드된 문제로 해석되는지 확인.

**Files:**
- Create: `scripts/verify-identity.mjs`

- [ ] **Step 1: 검증 스크립트 작성**

```javascript
// scripts/verify-identity.mjs
import 'dotenv/config';
import { db, sql, schema } from '../db/client.js';
import { eq } from 'drizzle-orm';

const SUPA = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const TABLE = process.env.SUPABASE_PROBLEM_OUTCOMES_TABLE || 'problem_outcomes';

const res = await fetch(`${SUPA}/rest/v1/${TABLE}?select=source_session_id,source_problem_number&source_session_id=like.practical-industrial*`, {
  headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
});
const outcomes = await res.json();

const srcRows = await db.select().from(schema.sources).where(eq(schema.sources.examType, 'practical'));
const keyToId = new Map(srcRows.map((s) => [s.key, s.id]));
const probRows = await db.select({ sourceId: schema.practicalProblems.sourceId, no: schema.practicalProblems.problemNo }).from(schema.practicalProblems);
const have = new Set(probRows.map((p) => `${p.sourceId}:${p.no}`));

let ok = 0, orphan = [];
for (const o of outcomes) {
  const sid = keyToId.get(o.source_session_id);
  const hit = sid && have.has(`${sid}:${Number(o.source_problem_number)}`);
  if (hit) ok += 1; else orphan.push(`${o.source_session_id}#${o.source_problem_number}`);
}
console.log(`실기 outcome ${outcomes.length}건 | 재연결 ${ok} | 고아 ${orphan.length}`);
if (orphan.length) console.log('고아:', [...new Set(orphan)].slice(0, 20));
await sql.end();
process.exit(orphan.length ? 1 : 0);
```

- [ ] **Step 2: 검증 실행**

Run: `npm run db:verify:identity`
Expected: `재연결 N | 고아 0` (exit 0). 고아가 나오면 해당 문제번호가 데이터셋에 없는 것 → 원본 조사.

- [ ] **Step 3: 커밋**

```bash
git add scripts/verify-identity.mjs
git commit -m "test(migration): 실기 outcome 재연결 검증 스크립트"
```

---

## Task 6: 검증 2 — 채점 패리티 (리스크 2)

기존 `gradePracticalAnswer`와 "정답을 그대로 입력했을 때" 새 저장 답이 정답 처리되는지 대조. 회귀 0 확인.

**Files:**
- Test: `tests/migration/grading-parity.test.js`

- [ ] **Step 1: 패리티 테스트 작성**

```javascript
// tests/migration/grading-parity.test.js
import { describe, it, expect } from 'vitest';
import { loadPracticalDatasetMaps } from '@/app/practical/[sessionId]/../_lib/practicalData';
import { PRACTICAL_SESSION_CONFIG } from '@/app/practical/_lib/practicalSessions';
import { gradePracticalAnswer } from '@/app/practical/[sessionId]/_lib/gradePracticalAnswer';
import { deriveAnswerModel } from '@/lib/migration/deriveAnswerModel';

describe('채점 패리티: 정답 입력은 항상 정답 처리', () => {
  it('전 실기 문항 — 저장된 정답을 유저답으로 넣으면 correct', async () => {
    const fails = [];
    for (const key of Object.keys(PRACTICAL_SESSION_CONFIG)) {
      const ds = await loadPracticalDatasetMaps(key);
      for (const [no, problem] of ds.problemsByNo) {
        const rawAnswer = ds.answersByNo.get(no);
        const model = deriveAnswerModel(problem, rawAnswer);
        // freeform(judge)은 GPT 심판이라 결정론 대조에서 제외
        if (model.answerKind === 'freeform') continue;
        const verdict = gradePracticalAnswer({
          userAnswer: model.answer,
          correctAnswer: model.answer,
          problem,
        });
        if (!verdict?.isCorrect) fails.push(`${key}#${no} kind=${model.answerKind}`);
      }
    }
    if (fails.length) console.log('회귀:', fails.slice(0, 20));
    expect(fails).toEqual([]);
  });
});
```

- [ ] **Step 2: 테스트 실행**

Run: `npx vitest run tests/migration/grading-parity.test.js`
Expected: PASS. 실패 목록이 나오면 `deriveAnswerModel`의 `answer` 정규화가 기존 채점과 어긋나는 지점 → 해당 kind 로직 수정 후 재실행.

- [ ] **Step 3: 전체 테스트 스위트 회귀 없음 확인**

Run: `npm test`
Expected: 기존 테스트 전부 PASS + 신규 2개 PASS

- [ ] **Step 4: 커밋**

```bash
git add tests/migration/grading-parity.test.js
git commit -m "test(migration): 채점 패리티 검증 (정답 입력=정답 처리)"
```

---

## Task 7: 슬라이스 마무리 확인

- [ ] **Step 1: 성공 기준 대조**

스펙 §8 체크:
- 실기 전 문항 시드 + 원본 분포 근사 (Task 4 Step 3)
- outcome 재연결 100% (Task 5)
- 채점 패리티 회귀 0 (Task 6)
- pgvector 설치됨 (Task 0 Step 3)

- [ ] **Step 2: 애매건 메모 확정**

Task 3 Step 5의 수동검토 후보를 리뷰하고, 오분류가 있으면 `deriveAnswerModel` 규칙 보정 후 Task 4·6 재실행.

- [ ] **Step 3: 슬라이스 요약 커밋**

```bash
git add -A
git commit -m "chore(migration): practical-industrial 수직 슬라이스 완료 — 식별자/채점 검증 통과"
```

---

## Self-Review 결과

- **스펙 커버리지:** §2 스택(Task 0·1) / §3.1·3.3·3.4 스키마(Task 2) / §4 시드·유도(Task 3·4) / §6 리스크1·2(Task 5·6) / §7 시작 접근 5단계(Task 0→6) / §8 성공기준(Task 7). §3.2 written·§3.5 개념/임베딩·§5 Phase 2~3은 본 슬라이스 범위 밖(스펙에 후속 명시) — 의도적 제외.
- **플레이스홀더:** 없음. 수동검토 후보는 "실제 데이터로 목록 생성"하는 실행 스텝으로 대체.
- **타입 일관성:** `deriveAnswerModel` 반환({answerKind, matchMode, answer, acceptedAnswers, answerTokens, answerBlanks})이 Task 3 정의 → Task 4 시드 → Task 6 테스트에서 동일하게 사용. `sources.key`/`practicalProblems`/`problemChoices` 스키마명이 Task 2·4·5에서 일치.
