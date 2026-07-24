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
