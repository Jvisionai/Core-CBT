# 문제 은행 Postgres 이전 — 설계

- 작성일: 2026-07-24
- 상태: 설계 승인 대기 (검토용)
- 범위: JSON 문제 은행 → PostgreSQL 구조화 이전 (Phase 1). RAG/임베딩 생성의 기반.

## 1. 배경과 목표

현재 문제 은행은 `datasets/` 아래 JSON 파일(`problem1.json` / `answer1.json` / `comment1.json` / `hint1.json` / `meta.json`)로 저장되고, 로더가 매 요청 시 파일을 읽는다. 이 방식은 잘 동작하지만 다음이 어렵다:

- 배포 없이 문제·해설 수정 (신고 처리 반복)
- 오답 기록(`problem_outcomes`)과 문제의 조인·통계
- 공개 레포에 원문 데이터가 노출 (저작권)
- **최종 목표**: 문제를 구조화·임베딩하여 RAG로 유사 문제를 생성

핵심 판단: **문제 지문·정답은 정적 데이터라 "전체 DB 이전"의 이득은 작지만, 위 기능들이 누적되고 있어 이전이 정당화된다.** 특히 RAG의 기반(깨끗한 구조 + 안정적 식별자)이 이전 없이는 불가능하다.

## 2. 스택 결정

| 항목 | 결정 | 근거 |
|---|---|---|
| DB | PostgreSQL | JSONB·배열·pgvector, 기존 Supabase(Postgres)와 `pg_dump` 호환 |
| 로컬 | OrbStack Postgres | 학습 목적, 제약 없음 |
| 접근 | Drizzle ORM | 스키마=TS 타입, 마이그레이션이 순수 SQL로 생성(읽으며 학습), SQL이 보이는 얇은 레이어 |
| 벡터 | pgvector (Phase 3) | 별도 벡터 DB 불필요 — 같은 DB 안에 `embedding` 컬럼. 1일차부터 확장만 설치 |

**Supabase는 최종적으로 걷어낼 수 있으나(사용자 동의)**, 살아있는 런타임 데이터는 Phase 2로 미뤄 리스크를 낮춘다.

## 3. 스키마

필기·SQLD(4지선다)와 실기(단답/순서/빈칸/작성)는 정답 모양이 완전히 달라 **타입별 분리 테이블**로 둔다. 한 테이블에 몰면 필기 행마다 실기 전용 컬럼이 전부 `null`이 된다. 회차 정보는 `sources`에 한 번만 두고 외래키로 참조한다.

### 3.1 sources

```
sources
  id          uuid pk
  key         text unique   -- 레거시 식별자 보존 (예: '12', 'practical-industrial-2022-1', 'pdfpack-industrial-2025-1', 'sqld-...')
  title       text
  exam_type   text          -- written | practical | sqld | aiprompt
  kind        text          -- gichul | pdf_exam | sqld | practical_industrial | ...
```

`key`는 **현재 `problem_outcomes.source_session_id`에 저장된 문자열과 정확히 일치**해야 한다 (§6 리스크 1).

### 3.2 written_problems (필기·SQLD)

데이터로 검증: 840문항 전부 보기 4개, 정답 인덱스·텍스트 정합성 오류 0. 실기용 축 불필요.

```
written_problems
  id            uuid pk
  source_id     uuid -> sources.id
  problem_no    int
  section_title text (null)
  question_text text
  options       text[]       -- 항상 4개
  answer_idx    int          -- 0~3, 항상 유효
  answer_text   text
  comment       text (null)
  unique(source_id, problem_no)
```

### 3.3 practical_problems (실기)

250문항을 하나의 답형으로 못 담는다. **서로 독립된 세 축**의 조합으로 표현한다.

**직교 축:**

| 축 | 값 | 결정하는 것 |
|---|---|---|
| `category` | 이론 / Code / SQL | 분류·필터 |
| `answer_kind` | single / sequence / set / multi_blank / freeform | 정답 저장형태 + UI |
| `match_mode` | normalized / exact / judge | 채점 엄격도 |

**answer_kind별 저장·채점:**

| kind | 정답 예 | 저장 | 채점 | UI |
|---|---|---|---|---|
| single | "NAT" · "00001011" | `answer` | normalized (이진/코드값은 exact) | 입력창 |
| sequence | "ㄹ → ㄷ → ㄴ → ㄱ" | `answer_tokens[]` 순서유지 | 순서 포함 토큰 일치 | 드래그 칩 |
| set | "ㄴ, ㄷ, ㄹ" (5개 중 3개) | `answer_tokens[]` 집합·가변길이 | 집합 일치(개수 비노출) | 체크박스 |
| multi_blank | "① GRANT ② ON ③ TO" · "22 15" | `answer_blanks jsonb` **길이=빈칸수** | 라벨매칭 or 위치매칭 | 라벨/순번 입력칸 |
| freeform | "SELECT DISTINCT 과목 FROM 학생 …" | `answer` | judge (정규화 SQL 또는 GPT 심판) | textarea |

```
practical_problems
  id               uuid pk
  source_id        uuid -> sources.id
  problem_no       int
  category         text        -- 이론|Code|SQL
  answer_kind      text        -- 시드에서 유도 (input_type 신뢰 X)
  match_mode       text        -- normalized|exact|judge
  question_text    text
  examples         text (null) -- 원문 (Code/SQL은 monospace 코드블록)
  answer           text        -- 표시용 (항상)
  accepted_answers text[] (null) -- 대안 표기 ["(S+W)/S","(W+S)/S"]
  answer_tokens    text[] (null) -- sequence·set 채점용
  answer_blanks    jsonb  (null) -- multi_blank [{ordinal,label?,value}] (값이 집합일 수도)
  answer_format_hint text (null)
  input_type       text        -- 원본 보존 (감사·재유도 대비)
  comment          text (null)
  hint             text (null)
  unique(source_id, problem_no)
```

### 3.4 problem_choices

열거형(순서·집합) 문제의 보기 항목. 필요한 ~10%만 행이 생긴다.

```
problem_choices
  id          uuid pk
  problem_id  uuid -> practical_problems.id
  marker      text   -- 'ㄱ' | '①'
  text        text
  ordinal     int    -- answer_tokens가 marker를 참조
```

### 3.5 개념 태그 / 임베딩 (Phase 2~3)

- `problem_concepts` (실기와 1:1, 리치 메타 jsonb): concept·required_knowledge·key_mechanism — daily-review 생성이 소비. Phase 2.
- `embedding vector` 컬럼 (pgvector): 의미적 중복제거 + few-shot 검색. Phase 3.

## 4. 시드 전략

- **JSON 파일을 git 원본(source of truth)으로 유지**. 앱은 DB에서 읽는다.
- 재실행 가능한 시드 스크립트가 `datasets/`를 읽어 `(source.key, problem_no)` 기준 upsert.
- `answer_kind`·`match_mode`는 **원본 `input_type` 복사 금지** — 질문·정답 신호로 유도 (자동 96%, 애매 7~11건 수동검토).
- 원본 `correct_answer_text`가 문자열이면 단일 정답, **배열이면 `accepted_answers`로 전개**.
- 시드 후 **원본 대조 검증 패스** 필수.

## 5. 범위 (단계)

- **Phase 1**: 문제 은행 (sources + written + practical + choices). 본 문서.
- **Phase 2**: 런타임 데이터(outcomes·generated·gpt cache) Supabase→Postgres, `problem_concepts`.
- **Phase 3**: pgvector 임베딩 — 의미적 중복제거, few-shot 생성.
- **미결 스코프**: `aiprompt`(AI 프롬프트) 계열 — 구조 확인 후 편입/보류 결정.

## 6. 이전 리스크 (RAG와 무관, 반드시 선결)

### 리스크 1 — 레거시 식별자 보존 (최대)
사용자 기록 전부가 `(source_session_id, source_problem_number)`로 문제를 참조. `source_session_id`가 **숫자형("12","7")과 슬러그형 혼재**하고, 숫자 id→데이터셋 매핑이 `app/test/*/page.js` 등 **~9개 파일에 하드코딩 산재**. `sources.key`가 이 값을 정확히 보존 못하면 1000+ 기록·오답추적·생성앵커가 고아가 된다.
→ 대응: 하드코딩 매핑 전수 수집 → `sources.key`로 보존. 이전의 실제 작업량 대부분.

### 리스크 2 — 채점 회귀
`gradePracticalAnswer.js`가 런타임에 구조를 재구성. 저장으로 옮기면 채점이 DB 필드를 읽도록 바뀌고, 최근 커밋(라벨·구분자 관용)을 재현 못하면 "맞던 게 틀리는" 회귀 발생.
→ 대응: 이전 전후 **동일 답안 → 동일 판정** 회귀 테스트(기존 outcome의 correct_answer로 대조).

### 리스크 3~5 (관리 가능)
- 소비처 9곳 + 이중 소스(파일·DB 병행) 불일치
- 런타임 지연(파일 ~0ms → DB) / 로컬·배포 DB 가용성
- 데이터 충실도(자동유도 7~11건 수동검토, 정답 폴리모피즘, 더러운 레코드 소수)

## 7. 시작 접근 — 리스크 검증 수직 슬라이스

빅뱅 대신 얇은 슬라이스로 두 리스크를 먼저 증명한다.

1. 로컬 OrbStack Postgres + **pgvector 확장** 설치 (substrate만 준비, 임베딩은 미사용)
2. Drizzle 스키마: `sources` + `practical_problems` + `problem_choices` (어려운 실기 먼저)
3. **한 계열만 시드**: `practical-industrial` — 레거시 id 매핑 포함
4. 두 리스크 증명:
   - 식별자: 해당 계열 과거 outcome이 `(source_session_id, source_problem_number)`로 **전부 재연결**되나
   - 채점 패리티: 기존 채점 vs 새 구조 채점 → **판정 100% 동일**(회귀 0)
5. 초록불이면 → 전 계열 확장 → 필기 → Phase 2 → Phase 3(pgvector)

## 8. 성공 기준

- [ ] `practical-industrial` 전 문항이 스키마로 손실 없이 시드되고 원본과 대조 통과
- [ ] 해당 계열 과거 outcome 100% 재연결
- [ ] 기존 채점과 새 구조 채점 판정 100% 일치
- [ ] `answer_kind` 자동유도 후 수동검토 대상만 리뷰 표시
- [ ] pgvector 확장이 설치되어 Phase 3 진입 시 마이그레이션 불필요
