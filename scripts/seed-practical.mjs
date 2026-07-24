import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { eq } from 'drizzle-orm';
import { db, sql, schema } from '../db/client.js';
import { PRACTICAL_SESSION_CONFIG } from '../app/practical/_lib/practicalSessions.js';
import { deriveAnswerModel } from '../lib/migration/deriveAnswerModel.js';

// 앱 로더(loadPracticalDatasetMaps)는 확장자 없는 import 체인이라 raw node에서 안 뜬다.
// 마이그레이션 스크립트는 데이터셋 JSON을 직접 읽어 앱 내부 변경과 독립시킨다.
const stripBom = (s) => String(s || '').replace(/^﻿/, '');
const readJson = (base, f) => JSON.parse(stripBom(fs.readFileSync(path.join(base, f), 'utf8')));
const flat = (d, k) => (Array.isArray(d) ? d.flatMap((s) => s[k] || (s.problem_number != null ? [s] : [])) : []);

function parseChoices(examples) {
  const items = [];
  String(examples || '').split(/\r?\n/).forEach((line) => {
    const m = line.match(/^\s*([ㄱ-ㅎ]|[①-⑳]|\d+)\s*[.):]\s*(.+)$/);
    if (m) items.push({ marker: m[1], text: m[2].trim(), ordinal: items.length });
  });
  return items;
}

let sourcesN = 0, problemsN = 0, choicesN = 0;
for (const [key, cfg] of Object.entries(PRACTICAL_SESSION_CONFIG)) {
  const base = path.resolve(process.cwd(), ...cfg.basePath);
  if (!fs.existsSync(path.join(base, 'problem1.json'))) { console.warn('skip (no data):', key); continue; }

  const problems = flat(readJson(base, 'problem1.json'), 'problems');
  const ansMap = new Map();
  flat(readJson(base, 'answer1.json'), 'answers').forEach((a) => ansMap.set(a.problem_number, a.correct_answer_text));
  const comMap = new Map();
  flat(readJson(base, 'comment1.json'), 'comments').forEach((c) => comMap.set(c.problem_number, c.comment ?? c.comment_text ?? ''));
  const hintMap = new Map();
  try { readJson(base, 'hint1.json').forEach((h) => { if (h?.problem_number != null) hintMap.set(h.problem_number, h.hint_body); }); } catch { /* 힌트 없음 */ }

  const [srcRow] = await db.insert(schema.sources)
    .values({ key, title: cfg.title, examType: 'practical', kind: 'practical_industrial' })
    .onConflictDoUpdate({ target: schema.sources.key, set: { title: cfg.title } })
    .returning();
  sourcesN += 1;

  for (const problem of problems) {
    const no = Number(problem.problem_number);
    const model = deriveAnswerModel(problem, ansMap.get(no));
    const [prob] = await db.insert(schema.practicalProblems)
      .values({
        sourceId: srcRow.id, problemNo: no,
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
        comment: comMap.get(no) || null,
        hint: hintMap.get(no) || null,
      })
      .onConflictDoUpdate({
        target: [schema.practicalProblems.sourceId, schema.practicalProblems.problemNo],
        set: { answerKind: model.answerKind, matchMode: model.matchMode, answer: model.answer, answerTokens: model.answerTokens, answerBlanks: model.answerBlanks },
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
