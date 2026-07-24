# 빈출 문제 Beta Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 정보처리산업기사 필기 "빈출 유형 열람" Beta 페이지 — 과목별 반복 출제 유형 + 집계 오답률을 정적 데이터로 보여주고, 실제 시험으로 링크.

**Architecture:** 오프라인 스크립트가 임베딩·과목군집·오답률을 계산해 정적 JSON으로 저장 → `/frequent` 서버 컴포넌트가 JSON을 import → 클라이언트 컴포넌트가 과목 탭으로 렌더. 런타임 임베딩·DB 없음. 기존 퀴즈·채점 코드 불변.

**Tech Stack:** Next.js(App Router), Tailwind, text-embedding-3-small, vitest, Chrome(검증).

**Spec:** `docs/superpowers/specs/2026-07-25-frequent-problems-beta-design.md`

---

## File Structure
- Create: `scripts/build-frequent-data.mjs` — 미리계산(임베딩·군집·오답률 → JSON)
- Create: `app/frequent/_data/frequent.json` — 정적 데이터 (스크립트 산출)
- Create: `app/frequent/page.js` — 서버 컴포넌트 (JSON import)
- Create: `app/frequent/FrequentClient.js` — 클라이언트 (과목 탭 + 카드)
- Create: `tests/frequent/frequentData.test.js` — 데이터 형태 검증
- Modify: `app/page.js` — 메인에 진입점 링크 추가

---

## Task 1: 미리계산 스크립트 + 정적 JSON

**Files:**
- Create: `scripts/build-frequent-data.mjs`
- Create: `app/frequent/_data/frequent.json` (스크립트가 생성)

- [ ] **Step 1: 스크립트 작성** (기존 `scripts/frequent-subject.mjs` 로직 + 오답률 집계)

```javascript
// scripts/build-frequent-data.mjs
import 'dotenv/config';
import fs from 'fs';
import path from 'path';

const KEY = process.env.OPENAI_API_KEY;
const SUPA = process.env.SUPABASE_URL;
const SKEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const OUT_TABLE = process.env.SUPABASE_PROBLEM_OUTCOMES_TABLE || 'problem_outcomes';
const DS = path.resolve(process.cwd(), 'datasets');
const OUT = path.resolve(process.cwd(), 'app/frequent/_data/frequent.json');
const TH = 0.86, MIN_ATTEMPTS = 20;
const stripBom = (s) => String(s || '').replace(/^﻿/, '');

const ROUNDS = [
  { dir: ['problem2024', 'first'], label: '2024-1', sid: '1' }, { dir: ['problem2024', 'second'], label: '2024-2', sid: '2' }, { dir: ['problem2024', 'third'], label: '2024-3', sid: '3' },
  { dir: ['problem2023', 'first'], label: '2023-1', sid: '6' }, { dir: ['problem2023', 'second'], label: '2023-2', sid: '7' }, { dir: ['problem2023', 'third'], label: '2023-3', sid: '8' },
  { dir: ['problem2022', 'first'], label: '2022-1', sid: '9' }, { dir: ['problem2022', 'second'], label: '2022-2', sid: '10' }, { dir: ['problem2022', 'third'], label: '2022-3', sid: '11' },
];
const SUBJECTS = ['정보시스템 기반기술', '프로그래밍 언어 활용', '데이터베이스 활용'];
const normSubj = (t) => { const s = String(t).replace(/\s+/g, '').replace(/의/g, ''); if (s.includes('정보시스템')) return SUBJECTS[0]; if (s.includes('프로그래밍')) return SUBJECTS[1]; if (s.includes('데이터베이스')) return SUBJECTS[2]; return t; };

const probs = [];
for (const r of ROUNDS) {
  const f = path.join(DS, ...r.dir, 'problem1.json');
  if (!fs.existsSync(f)) continue;
  JSON.parse(stripBom(fs.readFileSync(f, 'utf8'))).forEach((sec) => (sec.problems || []).forEach((p) => probs.push({ round: r.label, sid: r.sid, no: p.problem_number, question: p.question_text, options: p.options || [], subject: normSubj(sec.title) })));
}

async function embedBatch(texts) {
  let last; for (let a = 0; a < 4; a += 1) { try { const r = await fetch('https://api.openai.com/v1/embeddings', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` }, body: JSON.stringify({ model: 'text-embedding-3-small', input: texts }), signal: AbortSignal.timeout(120000) }); if (!r.ok) throw new Error(`embed ${r.status}`); return (await r.json()).data.map((d) => d.embedding); } catch (e) { last = e; await new Promise((rs) => setTimeout(rs, 2000 * (a + 1))); } } throw last;
}
const vecs = [];
for (let i = 0; i < probs.length; i += 96) vecs.push(...await embedBatch(probs.slice(i, i + 96).map((p) => `${p.question}\n${p.options.join(' / ')}`.slice(0, 4000))));
const dot = (u, v) => { let s = 0; for (let i = 0; i < u.length; i += 1) s += u[i] * v[i]; return s; };

// 오답률 집계: (sid, no) → {attempts, wrong}. 페이지네이션으로 전부 읽음.
const outcome = new Map();
if (SUPA && SKEY) {
  const sids = ROUNDS.map((r) => r.sid).join(',');
  for (let offset = 0; ; offset += 1000) {
    const url = `${SUPA}/rest/v1/${OUT_TABLE}?select=source_session_id,source_problem_number,is_correct&source_session_id=in.(${sids})&offset=${offset}&limit=1000`;
    const res = await fetch(url, { headers: { apikey: SKEY, Authorization: `Bearer ${SKEY}` } });
    const rows = await res.json();
    if (!Array.isArray(rows) || rows.length === 0) break;
    rows.forEach((o) => { const k = `${o.source_session_id}:${o.source_problem_number}`; const e = outcome.get(k) || { attempts: 0, wrong: 0 }; e.attempts += 1; if (o.is_correct === false) e.wrong += 1; outcome.set(k, e); });
    if (rows.length < 1000) break;
  }
}

const subjects = SUBJECTS.map((name) => {
  const idxs = probs.map((p, i) => (p.subject === name ? i : -1)).filter((i) => i >= 0);
  const parent = idxs.map((_, k) => k);
  const find = (x) => (parent[x] === x ? x : (parent[x] = find(parent[x])));
  for (let a = 0; a < idxs.length; a += 1) for (let b = a + 1; b < idxs.length; b += 1) if (dot(vecs[idxs[a]], vecs[idxs[b]]) >= TH) parent[find(a)] = find(b);
  const groups = {};
  idxs.forEach((gi, k) => { const rt = find(k); (groups[rt] = groups[rt] || []).push(gi); });
  let clusters = Object.values(groups).filter((g) => g.length >= 2)
    .map((g) => {
      const items = g.map((i) => probs[i]);
      const rounds = new Set(items.map((it) => it.round)).size;
      const kind = new Set(items.map((it) => it.question.replace(/\s+/g, ''))).size === 1 ? '동일' : '변형';
      let attempts = 0, wrong = 0;
      items.forEach((it) => { const e = outcome.get(`${it.sid}:${it.no}`); if (e) { attempts += e.attempts; wrong += e.wrong; } });
      const wrongRate = attempts >= MIN_ATTEMPTS ? Math.round((wrong / attempts) * 100) : null;
      return { rounds, size: items.length, kind, attempts, wrongRate, items };
    })
    .filter((c) => c.rounds >= 2)
    .sort((a, b) => (b.wrongRate ?? -1) * b.rounds - (a.wrongRate ?? -1) * a.rounds || b.rounds - a.rounds);
  const inCluster = clusters.reduce((s, c) => s + c.size, 0);
  return { name, total: idxs.length, repeatRate: Math.round((inCluster / idxs.length) * 100), clusters };
});

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify({ exam: '정보처리산업기사 필기', rounds: ROUNDS.length, subjects }, null, 2));
console.log('저장:', OUT, '| 과목별 클러스터:', subjects.map((s) => `${s.name} ${s.clusters.length}`).join(', '));
```

- [ ] **Step 2: 실행해 JSON 생성**

Run: `node scripts/build-frequent-data.mjs`
Expected: `저장: .../app/frequent/_data/frequent.json | 과목별 클러스터: 정보시스템... 50+, ...`

- [ ] **Step 3: JSON 형태 확인**

Run: `node -e "const d=require('./app/frequent/_data/frequent.json'); console.log('과목', d.subjects.length, '| 첫과목 클러스터', d.subjects[0].clusters.length, '| 오답률샘플', d.subjects[0].clusters.filter(c=>c.wrongRate!=null).length)"`
Expected: 과목 3, 클러스터 수십 개, 오답률 있는 클러스터 일부

- [ ] **Step 4: 커밋**

```bash
git add scripts/build-frequent-data.mjs app/frequent/_data/frequent.json
git commit -m "feat(beta): 빈출 데이터 미리계산 스크립트 + 정적 JSON"
```

---

## Task 2: 데이터 형태 테스트

**Files:**
- Test: `tests/frequent/frequentData.test.js`

- [ ] **Step 1: 테스트 작성**

```javascript
import { describe, it, expect } from 'vitest';
import data from '@/app/frequent/_data/frequent.json';

describe('frequent.json 형태', () => {
  it('과목 3개, 각 과목에 클러스터 존재', () => {
    expect(data.subjects).toHaveLength(3);
    data.subjects.forEach((s) => {
      expect(typeof s.name).toBe('string');
      expect(s.clusters.length).toBeGreaterThan(0);
    });
  });
  it('모든 클러스터는 rounds>=2, items 있음, kind 동일/변형', () => {
    for (const s of data.subjects) for (const c of s.clusters) {
      expect(c.rounds).toBeGreaterThanOrEqual(2);
      expect(c.items.length).toBeGreaterThanOrEqual(2);
      expect(['동일', '변형']).toContain(c.kind);
      expect(c.items[0]).toHaveProperty('sid');
      expect(c.items[0]).toHaveProperty('no');
    }
  });
  it('wrongRate는 null 또는 0~100, 있으면 attempts>=20', () => {
    for (const s of data.subjects) for (const c of s.clusters) {
      if (c.wrongRate !== null) { expect(c.wrongRate).toBeGreaterThanOrEqual(0); expect(c.wrongRate).toBeLessThanOrEqual(100); expect(c.attempts).toBeGreaterThanOrEqual(20); }
    }
  });
});
```

- [ ] **Step 2: 테스트 실행**

Run: `npx vitest run tests/frequent/frequentData.test.js`
Expected: PASS (3 tests)

- [ ] **Step 3: 커밋**

```bash
git add tests/frequent/frequentData.test.js
git commit -m "test(beta): 빈출 JSON 형태 검증"
```

---

## Task 3: /frequent 페이지 + 과목 탭 클라이언트

**Files:**
- Create: `app/frequent/FrequentClient.js`
- Create: `app/frequent/page.js`

- [ ] **Step 1: 클라이언트 컴포넌트 작성**

```javascript
// app/frequent/FrequentClient.js
'use client';
import { useState } from 'react';

export default function FrequentClient({ data }) {
  const [tab, setTab] = useState(0);
  const s = data.subjects[tab];
  return (
    <div>
      <div className="mb-5 flex flex-wrap gap-2">
        {data.subjects.map((sub, i) => (
          <button key={sub.name} onClick={() => setTab(i)}
            className={`rounded-full px-4 py-2 text-sm font-semibold transition ${i === tab ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600 border border-slate-200 hover:border-indigo-300'}`}>
            {sub.name} <span className="opacity-70">· {sub.repeatRate}%</span>
          </button>
        ))}
      </div>
      <p className="mb-4 text-sm text-slate-500">{s.name} — {s.total}문제 중 반복 유형 {s.clusters.length}개 (반복률 {s.repeatRate}%)</p>
      <div className="space-y-3">
        {s.clusters.map((c, i) => {
          const rep = c.items[0];
          return (
            <section key={i} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className="rounded-md bg-rose-50 px-2 py-1 font-mono text-xs font-bold text-rose-700">{c.rounds}회차 · {c.size}회 반복</span>
                <span className={`rounded-md px-2 py-1 font-mono text-xs font-bold ${c.kind === '동일' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>{c.kind}</span>
                {c.wrongRate != null && <span className="rounded-md bg-indigo-50 px-2 py-1 font-mono text-xs font-bold text-indigo-700">오답률 {c.wrongRate}%</span>}
              </div>
              <div className="whitespace-pre-wrap text-[15px] font-medium text-slate-800">{rep.question}</div>
              {rep.options?.length ? <ol className="mt-2 list-decimal pl-5 text-sm text-slate-500">{rep.options.map((o, k) => <li key={k}>{o}</li>)}</ol> : null}
              <div className="mt-3 flex flex-wrap gap-2">
                {c.items.map((it, k) => (
                  <a key={k} href={`/test/${it.sid}`} target="_blank" rel="noopener"
                    className="rounded-md border border-indigo-200 bg-indigo-50 px-2 py-1 font-mono text-xs font-semibold text-indigo-700 hover:bg-white">
                    {it.round} · {it.no}번 ↗
                  </a>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 서버 페이지 작성**

```javascript
// app/frequent/page.js
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import data from './_data/frequent.json';
import FrequentClient from './FrequentClient';

export const metadata = {
  title: '빈출 문제 (Beta) — 정보처리산업기사 필기',
  description: '반복 출제 유형을 임베딩으로 자동 분석한 빈출 문제 모음.',
};

export default function FrequentPage() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-indigo-50 via-white to-slate-100 px-4 py-6 dark:from-slate-950 dark:via-slate-900 dark:to-slate-900 md:py-10">
      <div className="mx-auto max-w-4xl">
        <Link href="/" className="mb-4 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800"><ArrowLeft size={16} /> 홈</Link>
        <div className="mb-1 flex items-center gap-2">
          <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white">빈출 문제</h1>
          <span className="rounded-full bg-indigo-600 px-2 py-0.5 text-xs font-bold text-white">Beta</span>
        </div>
        <p className="mb-6 max-w-2xl text-sm text-slate-500">{data.exam} {data.rounds}회차를 임베딩으로 자동 분석 — 반복 출제된 유형을 과목별로. 회차 뱃지를 누르면 실제 시험이 열립니다.</p>
        <FrequentClient data={data} />
      </div>
    </main>
  );
}
```

- [ ] **Step 3: 렌더 확인 (빌드 에러 없나)**

Run: `npx next build 2>&1 | grep -E "frequent|error|Error" | head` (또는 dev 서버에서 `/frequent` 접속)
Expected: frequent 라우트 빌드 성공, 에러 없음

- [ ] **Step 4: 커밋**

```bash
git add app/frequent/page.js app/frequent/FrequentClient.js
git commit -m "feat(beta): /frequent 페이지 + 과목 탭 빈출 카드"
```

---

## Task 4: 메인 진입점

**Files:**
- Modify: `app/page.js`

- [ ] **Step 1: 진입점 링크 추가** — 메인 카드 그리드(`app/page.js` line ~101 근처의 `grid` 블록) 안에, 기존 카드와 같은 클래스로 한 카드 추가:

```jsx
<Link href="/frequent" className="bg-white p-6 rounded-2xl shadow-sm hover:shadow-lg transition-shadow duration-300 border border-indigo-100">
  <div className="flex items-center gap-2">
    <h3 className="font-bold text-slate-800">빈출 문제</h3>
    <span className="rounded-full bg-indigo-600 px-2 py-0.5 text-[10px] font-bold text-white">Beta</span>
  </div>
  <p className="mt-2 text-sm text-slate-500">반복 출제 유형을 과목별로 — 자주 나오고 많이 틀리는 문제 우선</p>
</Link>
```
(실제 삽입 위치는 기존 카드 블록을 읽고, 같은 그리드 컨테이너 자식으로 추가. import된 `Link`가 이미 있으면 재사용.)

- [ ] **Step 2: 진입점 보이는지 확인**

Run: dev 서버에서 홈(`/`) 접속 → "빈출 문제 Beta" 카드 보이고 클릭 시 `/frequent` 이동
Expected: 카드 표시 + 이동 정상

- [ ] **Step 3: 커밋**

```bash
git add app/page.js
git commit -m "feat(beta): 메인에 빈출 문제 Beta 진입점"
```

---

## Task 5: 크롬 더블체크 (실제 브라우저 검증)

**Files:** (없음 — 검증만)

- [ ] **Step 1: dev 서버 확인 + 페이지 크롬으로 열기**

Run: `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/frequent` (200 확인) 그리고 `open -a "Google Chrome" http://localhost:3000/frequent`
Expected: 200, 크롬에 빈출 페이지 열림

- [ ] **Step 2: "비슷한 문제인지" 더블체크**

한 과목 탭에서 "완전 동일" 클러스터 1개, "변형" 클러스터 1개를 골라:
- 각 클러스터의 회차 뱃지 2개 이상을 눌러 실제 시험(`/test/<sid>`)을 열고
- 해당 번호 문제를 찾아 **두 회차의 문제가 실제로 같은/유사한지 눈으로 대조**
Expected: 동일=글자까지 같음, 변형=뜻 같고 표현 다름 (오분류면 임계값/데이터 재검토)

- [ ] **Step 3: 결과 기록**

검증 결과(동일 N개·변형 N개 확인, 오분류 유무)를 한 줄 메모로 남기고 완료 커밋:
```bash
git commit --allow-empty -m "chore(beta): 크롬 더블체크 완료 — 빈출 유형 유사성 확인"
```

---

## Self-Review 결과
- **스펙 커버리지:** §4.1 스크립트(Task1) / §4.2 데이터형태(Task1·2) / §4.3 페이지(Task3) / §4.4 진입점(Task4) / §6 오답률 제약(Task1 MIN_ATTEMPTS·Task2 테스트) / §7 테스트(Task2) / §9 성공기준(전 Task). 크롬 더블체크(사용자 요청)=Task5.
- **플레이스홀더:** 없음. Task4 삽입 위치만 "기존 카드 읽고"로 안내(실 코드 제공).
- **타입 일관성:** JSON 필드(subjects[].{name,total,repeatRate,clusters[].{rounds,size,kind,attempts,wrongRate,items[].{round,sid,no,question,options}}})가 Task1 생성 → Task2 테스트 → Task3 렌더에서 동일하게 사용.
