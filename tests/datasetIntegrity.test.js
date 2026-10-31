import { describe, it, expect } from 'vitest';
import { execFileSync } from 'child_process';

// 데이터셋 정답/입력틀 검증 스크립트가 문제 0건으로 끝나는지 확인
function runAudit(script) {
  try {
    return { code: 0, out: execFileSync('node', [script], { encoding: 'utf8' }) };
  } catch (error) {
    return { code: error.status, out: String(error.stdout || '') + String(error.stderr || '') };
  }
}

describe('dataset integrity', () => {
  it('실기: 정답을 입력칸에 그대로 넣으면 정답, 순서/칸을 바꾸면 오답', () => {
    const { code, out } = runAudit('scripts/audit_practical_answers.mjs');
    expect(code, out).toBe(0);
  });

  it('객관식: 정답 텍스트가 보기와 정확히 일치하고 인덱스가 맞음', () => {
    const { code, out } = runAudit('scripts/audit_objective_answers.mjs');
    expect(code, out).toBe(0);
  });
});
