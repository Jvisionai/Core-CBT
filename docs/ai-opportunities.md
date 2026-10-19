# 변경 필요 사항 & AI 적용 후보 분석

작성일: 2026-10-19 · 기준 커밋: `059134a`

---

## 1. 현재 AI가 쓰이는 곳

| 위치 | 기능 | 방식 |
|---|---|---|
| `app/api/gpt/objection/route.js` | 문제별 GPT 보조 해설 / 이의제기 / 후속질문 | `gpt-4.1-mini` 직접 호출 + Supabase 캐시(`gpt_objection_cache`) |
| `app/api/gpt/feedback/route.js` | GPT 답변 좋아요/싫어요 | 캐시 행 카운트 |
| `fastapi_app/` + `app/practical/coach/` | 실기 AI 코치 (대화, 제출 평가, 유사문제 제시) | tool-calling 에이전트, 코드 실행 검증(`code_executor.py`), critic fallback |
| `app/_components/SpeakButton.js`, `VoiceInputButton.js`, `app/shorts/` | TTS / STT | 브라우저 Web Speech + Edge TTS 사전 생성(`scripts/generate_tts.py`) |
| `datasets/tags/*.json` | 문제 태그(개념/필요지식/유형) | 실기만 존재 (254건) |

---

## 2. 변경 필요 사항 (AI와 무관)

| 우선순위 | 항목 | 근거 |
|---|---|---|
| 🔴 높음 | 하드코딩된 테스트 계정 제거 또는 환경변수로 이동 | `auth.js` — `testuser` / `test1234`가 운영에서도 로그인 가능 |
| 🟡 중간 | macOS 복사본 정리 | `app/test/my-wrong/page 2.js`, `app/test/my-unknown/page 2.js`, `app/test/layouts/page 2.js`, `app/sqld/my-wrong/page 2.js`, `public/images/ai-prompt/**/* 2.png/svg`, 루트 `image copy.png` |
| 🟡 중간 | 일회성 스크립트 정리 | `scripts/tmp_patch_practical_2025_first_from_user_list.js` 등 |
| 🟡 중간 | 거대 컴포넌트 분리 | `app/test/[sessionId]/Quiz.js` (2,389줄), `app/admin/page.js` (2,277줄) |
| 🟢 낮음 | 2026-1회 실기 힌트 누락 | `datasets/practicalIndustrial/2026-first/`에 `hint1.json` 없음 (13개 회차 중 유일) |
| 🟢 낮음 | GPT 모델/프롬프트 분산 | Next.js 라우트는 OpenAI 직접 호출, 코치는 FastAPI 경유 → LLM 호출 경로가 2개 |

---

## 3. AI 적용 후보

### 3-1. 해설 품질 보강 (데이터, 효과 큼) ⭐

`comment1.json` 해설 중 60자 미만(사실상 "정답은 X입니다" 수준) 비율:

| 데이터셋 | 전체 | 60자 미만 |
|---|---:|---:|
| problem2023 (필기) | 180 | **173** |
| problem2022 (필기) | 180 | **148** |
| problemNow_60 | 60 | **59** |
| practicalIndustrial (실기) | 250 | 77 |
| sqld | 300 | 66 |
| problem2024 (필기) | 180 | 53 |
| problem100 | 100 | 11 |
| aiPromptEngineering | 83 | 7 |

- SQLD 2024·2025는 최근 커밋에서 "디테일판"으로 보강됨 → **같은 방식을 필기 2022/2023/Now_60에 적용**.
- 방식: 배치 스크립트(`scripts/enhance_comments_years.js` 계열 재사용)로 LLM이 초안 생성 → 기존 **해설 수정 제안 큐(`/admin/edits`)에 넣어 사람이 승인 → 라운드 PR**. 이미 있는 검수 파이프라인을 그대로 쓰므로 품질 관리 가능.
- 부수효과: GPT 보조 해설 호출 수(=비용) 감소.

### 3-2. 필기·SQLD 문제 태깅 → 약점 분석 확장 ⭐

- 태그(`datasets/tags/`)가 **실기에만** 있어서 `aggregate_topic_stats`, `/api/user/topic-stats`, 마이페이지 약점 분석이 필기·SQLD에서는 동작하지 않음.
- 필기 ~600문항 + SQLD 300문항을 LLM으로 같은 스키마(`concept`, `tags`, `required_knowledge`, `problem_style`)로 일괄 태깅.
- 이후 활용: 과목/개념별 정답률, "약한 개념만 모아 풀기" 모드, 코치의 유사문제 추천을 필기에도 적용.

### 3-3. 실기 채점 보조 (애매한 오답 판정)

- `gradePracticalAnswer.js`(881줄)는 규칙 기반 정규화로 동의어·표기 차이를 처리. 규칙에 없는 표현(예: 약어 vs 풀네임, 띄어쓰기/영한 혼용)은 오답 처리됨.
- 규칙 채점이 **오답**일 때만 LLM에 "의미상 동일한가?"를 묻고, 결과는 "AI 판정: 정답으로 인정 가능" 배지로 표시(점수는 사용자가 선택). 판정은 캐시하고, 자주 인정되는 표현은 `acceptable_answers`로 데이터에 반영.

### 3-4. 신고·해설 수정 제안 1차 분류

- 신고(`/api/admin/reports`)와 해설 수정 제안(`/api/edits`)이 들어오면 LLM이 원본과 비교해 `타당 / 중복 / 스팸 / 정답 자체 오류 의심` 분류 + 요약을 붙여 Discord 알림(`lib/discordNotify.js`)과 관리자 큐에 표시.
- 관리자 일괄 처리(TODO에 있음)와 같이 하면 검수 시간이 줄어듦.

### 3-5. 개인화 복습 / 학습 리포트

- 오답·모름 기록(`wrongProblemsStore`, `unknownProblemsStore`)과 3-2의 태그를 조합해 "이번 주 약점 리포트"를 생성 (마이페이지 카드).
- 시험일 기준 남은 기간에 맞춘 복습 순서 추천. 생성 결과는 사용자별·일별로 캐시.

### 3-6. 변형 문제 생성

- 코치의 `present_similar_problem`은 기존 문제에서 고름 → 문제 풀이 소진 시 한계.
- 실기 코드 문제는 LLM이 변수/조건을 바꾼 변형을 만들고 **`code_executor.py`로 실제 실행해 정답을 검증**한 것만 노출 (이미 있는 검증 도구 재사용 가능).

### 3-7. 숏츠 자동 제작

- 이미 TTS 캐시 + 자동 진행 플레이어가 있음. 해설에서 TTS용 대본(괄호 제거, 키워드 한글 발음 등 현재 수작업 규칙)을 LLM으로 생성해 회차 추가 비용을 줄임.

---

## 4. 추천 순서

1. **보안/정리** (2장 🔴, 🟡) — 작업량 적고 위험 제거
2. **3-1 해설 보강** — 사용자 체감 최대, 기존 검수 파이프라인 재사용
3. **3-2 태깅** — 3-3·3-5·3-6의 전제 데이터
4. 3-4 → 3-3 → 3-5 → 3-6 → 3-7

공통 인프라 제안: LLM 호출을 FastAPI(`fastapi_app/agent/llm_client.py`) 한 곳으로 모으고, Next.js 라우트는 프록시만 하도록 정리하면 모델 교체·비용 추적·캐시를 한 곳에서 관리할 수 있음.
