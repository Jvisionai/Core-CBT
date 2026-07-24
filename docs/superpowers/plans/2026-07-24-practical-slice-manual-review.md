# 실기 슬라이스 — 수동검토 후보 (시드 자동분류)

시드 시 `deriveAnswerModel` 자동 분류에서 애매하게 처리된 문항. 250건 중 4건(1.6%). 채점은 `answer` 텍스트로 정상 동작(패리티 통과)하므로 긴급도 낮음 — UI 표현/구조 정확도만 관련.

## multi_blank인데 blanks 구조 파싱 실패 (라벨 없는 위치형) — 3건

| source | no | answer | 비고 |
|---|---|---|---|
| practical-industrial-2022-1 | 15 | `11, 17` | 라벨 없는 두 값. 위치(①②)로 채점 |
| practical-industrial-2023-1 | 2 | `고객, 책, 출판사 / 구매, 공급` | 두 그룹, 각 그룹이 값 집합 |
| practical-industrial-2023-1 | 9 | `4, 32` | 라벨 없는 두 값 |

→ 조치안: `answer_blanks`에 라벨 없이 `[{ordinal, label:null, value}]`로 위치형 채우는 규칙 추가 가능. 현재는 `answer` 텍스트로 채점.

## single ↔ set 애매 — 1건

| source | no | answer | 비고 |
|---|---|---|---|
| practical-industrial-2025-1 | 12 | `ㄷ, ㄱ, ㅂ` | 기호 3개. "모두 고르" 표현 없어 single로 분류됨. set일 가능성 → 원문 확인 필요 |

→ 조치안: 원문 질문 확인 후 set이면 규칙 보정 또는 개별 지정.
