import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { gradePracticalAnswer } from '@/app/practical/[sessionId]/_lib/gradePracticalAnswer';
import { deriveAnswerModel } from '@/lib/migration/deriveAnswerModel';

const BASE = path.resolve(process.cwd(), 'datasets/practicalIndustrial');
const stripBom = (s) => String(s || '').replace(/^﻿/, '');
const read = (dir, f) => JSON.parse(stripBom(fs.readFileSync(path.join(BASE, dir, f), 'utf8')));
const flat = (d, k) => (Array.isArray(d) ? d.flatMap((s) => s[k] || (s.problem_number != null ? [s] : [])) : []);

function loadRound(dir) {
  const problems = flat(read(dir, 'problem1.json'), 'problems');
  const ansMap = new Map();
  flat(read(dir, 'answer1.json'), 'answers').forEach((a) => ansMap.set(a.problem_number, a.correct_answer_text));
  return { problems, ansMap };
}

const rounds = fs.readdirSync(BASE).filter((d) => fs.statSync(path.join(BASE, d)).isDirectory());

describe('채점 패리티: 저장할 정답을 그대로 입력하면 기존 채점이 정답 처리', () => {
  it('freeform(judge) 제외한 전 실기 문항에서 회귀 0', () => {
    const fails = [];
    for (const dir of rounds) {
      const { problems, ansMap } = loadRound(dir);
      for (const problem of problems) {
        const rawAnswer = ansMap.get(problem.problem_number);
        if (rawAnswer == null) continue;
        const model = deriveAnswerModel(problem, rawAnswer);
        if (model.answerKind === 'freeform') continue; // GPT 심판 — 결정론 대조 제외
        // 저장할 canonical 정답을 유저가 그대로 입력했을 때 정답 처리되는가
        const verdict = gradePracticalAnswer({
          userAnswer: model.answer,
          correctAnswer: model.answer,
          problem,
        });
        // accepted_answers(대안 표기) 각각도 정답 처리되는가
        const accepts = model.acceptedAnswers || [];
        const acceptFail = accepts.find((v) => !gradePracticalAnswer({ userAnswer: v, correctAnswer: model.answer, problem })?.matched);
        if (!verdict?.matched) {
          fails.push(`${dir}#${problem.problem_number} kind=${model.answerKind} ans=${JSON.stringify(model.answer).slice(0, 40)}`);
        } else if (acceptFail) {
          fails.push(`${dir}#${problem.problem_number} 대안불일치 ${JSON.stringify(acceptFail).slice(0, 30)}`);
        }
      }
    }
    if (fails.length) console.log(`회귀 ${fails.length}건:\n` + fails.slice(0, 30).join('\n'));
    expect(fails).toEqual([]);
  });
});
