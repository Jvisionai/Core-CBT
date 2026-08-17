# AI Quality Lab v1 — DB 전환 Handoff

## 목적

문제 생성 품질을 **Before / After**로 비교하는 실험 전용 데이터 구조를 만든다.

- Before: 현재 Core-CBT 생성 흐름 (현재 로컬 프롬프트 + 기존 모델 호출)
- After: Langfuse Prompt + OpenRouter 모델 + 선택적으로 벡터 검색을 적용한 흐름
- 같은 원본 문제 세트로 두 조건을 실행해 재생성 요청률, 반려율, 비용, 지연 시간을 비교한다.

이 구조는 운영 학습용 `generated_problems`와 분리한다. 실험 실행이 학습 문제를 저장하거나 사용자 복습 큐에 영향을 주면 안 된다.

## 현재 원본 데이터

현재 원본은 JSON 기반이며, 기존 코드에서 다음 legacy 식별자를 사용한다.

```text
source_session_id
source_problem_number
```

DB 전환 후 `practical_problems.id` 같은 안정적인 원본 PK가 생기면 `source_problem_id`를 함께 저장한다. 비교 재현성을 위해 **원본 참조만 저장하지 말고, 실험 시작 시점의 입력 스냅샷도 보존**한다.

## 필요한 테이블

### 1. `ai_experiments`

실험 하나 = 같은 원본 문제 세트에 대한 Before 또는 After 실행 묶음이다.

| 컬럼 | 제안 타입 | 설명 |
| --- | --- | --- |
| `id` | uuid PK | 실험 ID / Langfuse session ID와 연결 |
| `name` | text | 예: `generation-baseline-2026-07-24` |
| `status` | text | `draft`, `running`, `completed`, `failed`, `cancelled` |
| `planned_count` | integer | 계획 원본 문제 수. v1 기본값 20 |
| `created_by` | text nullable | 실행한 관리자 식별자 |
| `control_config` | jsonb | Before 조건의 고정 설정 |
| `treatment_config` | jsonb | After 조건의 고정 설정 |
| `created_at`, `started_at`, `completed_at` | timestamptz | 실행 시각 |

`control_config` / `treatment_config`에는 키를 저장하지 않는다. 아래처럼 **모델 ID·프롬프트 식별자·실행 파라미터만** 저장한다.

```json
{
  "provider": "openai-direct",
  "generator_model": "gpt-4.1",
  "judge_model": "gpt-4.1-mini",
  "generator_prompt_ref": "local-v1",
  "judge_prompt_ref": "local-v1",
  "temperature": 0.3,
  "max_regenerations": 2,
  "retrieval_enabled": false
}
```

### 2. `ai_experiment_items`

실험에 고정된 원본 문제 목록이다. Before / After는 반드시 **같은 item**을 사용한다.

| 컬럼 | 제안 타입 | 설명 |
| --- | --- | --- |
| `id` | uuid PK | 항목 ID |
| `experiment_id` | uuid FK | `ai_experiments.id` |
| `ordinal` | integer | 실험 내 표시 순서 |
| `source_problem_id` | uuid nullable | DB 전환 후 원본 문제 FK |
| `source_session_id` | text | legacy 호환 식별자 |
| `source_problem_number` | integer | legacy 호환 문항 번호 |
| `category`, `subcategory`, `concept` | text nullable | 필터·분석용 분류 |
| `source_snapshot` | jsonb | 실행 당시 원본 문제/보기/정답/해설 |
| `created_at` | timestamptz | 생성 시각 |

제약:

```text
UNIQUE (experiment_id, source_session_id, source_problem_number)
UNIQUE (experiment_id, ordinal)
```

`source_snapshot` 최소 형태:

```json
{
  "question_text": "...",
  "examples": "...",
  "answer": "...",
  "comment": "..."
}
```

### 3. `ai_generation_attempts`

**Generator 한 번 호출 = 행 한 개**다. 첫 시도는 `attempt_no = 0`, 재생성은 `1`, `2`로 증가한다.

| 컬럼 | 제안 타입 | 설명 |
| --- | --- | --- |
| `id` | uuid PK | 시도 ID |
| `experiment_item_id` | uuid FK | 대상 원본 문제 |
| `arm` | text | `before` 또는 `after` |
| `attempt_no` | integer | 0 = 최초 생성, 1 이상 = 재생성 |
| `status` | text | `accepted`, `rejected`, `error` |
| `generator_provider`, `generator_model` | text | 실제 생성 모델 |
| `judge_provider`, `judge_model` | text nullable | 실제 Judge 모델 |
| `generator_prompt_name`, `generator_prompt_version` | text nullable | Langfuse 또는 local prompt 식별자 |
| `judge_prompt_name`, `judge_prompt_version` | text nullable | Judge prompt 식별자 |
| `retrieval_enabled` | boolean | 검색 사용 여부 |
| `retrieval_context` | jsonb nullable | query, index version, top-k IDs/scores |
| `generated_output` | jsonb nullable | 생성 모델의 파싱된 JSON 결과 |
| `gate_result` | jsonb nullable | 결정론적 Gate 결과 |
| `judge_result` | jsonb nullable | `concept_same` 등 Judge 결과 |
| `failure_reasons` | jsonb | 재생성 또는 반려 사유 배열 |
| `input_tokens`, `output_tokens` | integer nullable | 사용량 |
| `cost_usd` | numeric nullable | 비용 |
| `latency_ms` | integer nullable | Generator 응답 시간 |
| `langfuse_trace_id` | text nullable | Langfuse Trace 연결 |
| `openrouter_generation_id` | text nullable | OpenRouter 요청 연결 |
| `created_at` | timestamptz | 호출 시각 |

권장 제약:

```text
UNIQUE (experiment_item_id, arm, attempt_no)
CHECK (arm IN ('before', 'after'))
CHECK (attempt_no >= 0)
CHECK (status IN ('accepted', 'rejected', 'error'))
```

## 재생성률 계산 규칙

Judge 호출은 매 시도마다 필요한 검사이므로 메인 지표의 분자에 넣지 않는다.

```text
재생성 요청률
= arm별 attempt_no >= 1 인 Generator 호출 수
÷ 해당 arm의 계획 문제 수
× 100
```

예: 계획 20문제, `after`에서 재생성 Generator 호출이 7번이면 `35%`.

함께 제공할 보조 지표:

```text
최종 반려율 = accepted attempt가 없는 item 수 ÷ 계획 문제 수
재생성 발생 문제 비율 = attempt_no >= 1이 하나라도 있는 item 수 ÷ 계획 문제 수
실패 사유 분포 = failure_reasons별 rejected attempt 수
문제당 비용 = arm별 모든 Generator + Judge 비용 ÷ 계획 문제 수
```

## 실행 규칙

1. 실험 생성 시 현재 JSON/DB 원본에서 20개를 선택하고 `ai_experiment_items`에 스냅샷을 저장한다.
2. Before 실행과 After 실행은 같은 item을 사용한다.
3. Generator 결과마다 하드 Gate를 실행한다.
4. Gate 통과 결과에만 Judge를 실행한다.
5. 실패하면 `failure_reasons`를 다음 Generator 프롬프트 변수로 전달하고 `attempt_no`를 증가시킨다.
6. 최대 재생성 횟수는 실험 Config에 고정한다. v1 기본값은 2회다.
7. 성공·실패 모든 시도를 `ai_generation_attempts`에 저장한다.
8. **실험 흐름은 `generated_problems`에 INSERT 하지 않는다.**

## 관리자 화면 연결 조건

구현된 화면: `/admin/ai-lab`

현재 v1 화면은 JSON 원본에서 고정 테스트 세트와 실험 설계를 보여주는 읽기 전용 도구다. 실행 기능은 위 테이블이 준비된 뒤 연결한다.

필요한 API 계약:

```text
POST /api/admin/ai-lab/experiments
  - 20개 원본을 고정하고 ai_experiments + ai_experiment_items 생성

POST /api/admin/ai-lab/experiments/:id/run
  - body: { arm: "before" | "after" }
  - 각 item을 실행하고 모든 attempt를 기록

GET /api/admin/ai-lab/experiments/:id
  - Before/After 요약, item별 attempt 및 결과 반환
```

실행 API는 비용이 발생하는 모델 호출을 하므로 화면이 공개되어 있더라도 별도 서버 측 실행 보호가 필요하다. API Key는 절대 클라이언트에 보내지 않는다.

## Langfuse 연결 필드

After 실행 시에만 최소한 다음을 연결한다.

```text
session_id = ai_experiments.id
trace metadata = experiment_id, experiment_item_id, arm, attempt_no
generation metadata = generator/judge model, prompt name/version, retrieval_enabled
score = regeneration_count 또는 attempt_no
```

Langfuse는 분석·비교용 기록 도구다. 통과/재생성의 실시간 결정은 Core-CBT 서버가 한다.

## 완료 기준

- [ ] 실험 생성 시 20개 원본과 스냅샷이 고정된다.
- [ ] Before / After 실행이 운영 `generated_problems`와 분리된다.
- [ ] 모든 Generator 시도가 `attempt_no`와 실패 사유를 남긴다.
- [ ] 같은 실험 ID에서 arm별 비교가 가능하다.
- [ ] 재생성 요청률을 추가 Generator 호출 수 기준으로 계산할 수 있다.
