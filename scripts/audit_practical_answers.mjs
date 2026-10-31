// 실기 데이터셋 정답/입력틀 자체 검증.
// 실제 화면(PracticalQuiz.js)과 같은 입력 타입 판정·입력칸 생성·채점 로직으로
// "정답을 그대로 입력하면 정답 처리되는가"를 모든 문항에 대해 시뮬레이션한다.
//
// 사용법: node scripts/audit_practical_answers.mjs [--json]
import fs from 'fs';
import path from 'path';

const ROOT = process.cwd();
const QUIZ_FILE = path.join(ROOT, 'app/practical/[sessionId]/PracticalQuiz.js');
const BASE = path.join(ROOT, 'datasets/practicalIndustrial');

// PracticalQuiz.js의 순수 헬퍼(getSequenceMeta ~ parseLabeledAnswerPairs)를 그대로 가져와 평가한다.
function loadQuizHelpers() {
  const src = fs.readFileSync(QUIZ_FILE, 'utf8');
  const start = src.indexOf('function getSequenceMeta(');
  const end = src.indexOf('function PracticalAnswerDisplay(');
  if (start < 0 || end < 0) throw new Error('PracticalQuiz.js 헬퍼 구간을 찾지 못함');
  const body = `const UNKNOWN_OPTION = '__UNKNOWN_OPTION__';\n${src.slice(start, end)}\nreturn {
    getSequenceMeta, getMultiBlankMeta, inferNamedPairLabelsFromAnswer, parsePracticalSymbolChoices,
    splitSequenceDraft, splitMultiBlankDraft, sanitizeSequenceToken, normalizeSequenceLikeAnswer,
    normalizeUnorderedSymbolSetAnswer, normalizeLabeledMultiBlankAnswer, getLabeledTokenMatches,
    parseLabeledMultiBlankValues, parseLabeledMultiBlankValuesByKnownLabels, isPracticalAnswerMatch,
  };`;
  return new Function(body)();
}

const H = loadQuizHelpers();
const stripBom = (s) => String(s || '').replace(/^﻿/, '');
const readJson = (f) => JSON.parse(stripBom(fs.readFileSync(f, 'utf8')));

// PracticalQuizV2.normalizeInputType
function normalizeInputType(inputType) {
  const v = String(inputType || 'single').trim();
  if (['single', 'unordered_symbol_set', 'ordered_sequence', 'multi_blank', 'textarea'].includes(v)) return v;
  if (v === 'sequence') return 'ordered_sequence';
  return 'single';
}

// practicalData.js + PracticalQuizV2와 같은 방식으로 문항을 구성
function loadSession(dir) {
  const problems = readJson(path.join(dir, 'problem1.json'));
  const answers = readJson(path.join(dir, 'answer1.json'));
  const records = new Map();
  for (const s of answers) {
    for (const a of s.answers || []) {
      const texts = Array.isArray(a.correct_answer_text) ? a.correct_answer_text : [String(a.correct_answer_text ?? '')];
      records.set(Number(a.problem_number), {
        correct: texts[0],
        accepted: [...texts, ...(Array.isArray(a.accepted_answers) ? a.accepted_answers.map(String) : [])].filter(Boolean),
      });
    }
  }
  const out = [];
  for (const s of problems) {
    for (const p of s.problems || []) {
      const rec = records.get(Number(p.problem_number));
      const accepted = Array.isArray(p.accepted_answers) && p.accepted_answers.length > 0 ? p.accepted_answers : rec?.accepted || [];
      out.push({
        problem: {
          ...p,
          input_type: normalizeInputType(p.input_type),
          accepted_answers: accepted.map((v) => String(v ?? '').trim()).filter(Boolean),
        },
        rawInputType: p.input_type,
        correct: rec ? rec.correct : null,
      });
    }
  }
  return out;
}

// PracticalQuiz.js 렌더 구간의 입력 타입 판정 재현
function resolveInputType(problem, correctAnswer) {
  const raw = String(problem?.input_type || 'single');
  const explicitSeq = raw === 'ordered_sequence' || raw === 'unordered_symbol_set';
  const symbolChoices = raw === 'single' ? H.parsePracticalSymbolChoices(problem) : [];
  const unorderedEvidence = raw === 'single' && !!H.normalizeUnorderedSymbolSetAnswer(correctAnswer);
  const seqBase = raw === 'sequence' || explicitSeq || unorderedEvidence ? H.getSequenceMeta(problem, correctAnswer) : null;
  const forceUnordered = raw === 'single' && unorderedEvidence && symbolChoices.length >= 2;
  const seqRaw = seqBase && forceUnordered ? { ...seqBase, mode: 'unordered_symbol_set' } : seqBase;
  const seqEvidence = !!seqRaw && (!!H.normalizeSequenceLikeAnswer(correctAnswer) || !!H.normalizeUnorderedSymbolSetAnswer(correctAnswer));
  const simpleWord =
    !H.normalizeSequenceLikeAnswer(correctAnswer) &&
    !H.normalizeUnorderedSymbolSetAnswer(correctAnswer) &&
    !H.normalizeLabeledMultiBlankAnswer(correctAnswer) &&
    /^[\p{L}\p{N}\s().,+/-]+$/u.test(String(correctAnswer ?? '').trim());
  const labelsInAnswer = raw === 'single' && H.getLabeledTokenMatches(String(correctAnswer ?? '')).length >= 2;
  const pairLabels = raw === 'single' ? H.inferNamedPairLabelsFromAnswer(correctAnswer) : [];
  const type = explicitSeq
    ? 'sequence'
    : raw === 'sequence' && (!seqEvidence || simpleWord)
      ? 'single'
      : raw === 'single' && (labelsInAnswer || pairLabels.length >= 2)
        ? 'multi_blank'
        : raw;
  return {
    type,
    sequenceMeta: type === 'sequence' ? seqRaw : null,
    multiBlankMeta: type === 'multi_blank' ? H.getMultiBlankMeta(problem, correctAnswer) : null,
  };
}

// 사용자가 입력칸에 정답을 그대로 채웠을 때 저장되는 답안 문자열을 재현
function simulateUserInput(answerText, resolved) {
  const issues = [];
  if (resolved.type === 'sequence') {
    const meta = resolved.sequenceMeta;
    if (!meta) return { input: answerText, issues: ['sequence 메타 없음'] };
    if (meta.mode === 'unordered_symbol_set') return { input: answerText, issues };
    const tokens = H.splitSequenceDraft(answerText, meta.count).map((t) => H.sanitizeSequenceToken(t, meta.kind));
    const answerTokenCount = (H.normalizeSequenceLikeAnswer(answerText) || '').split('-').filter(Boolean).length;
    if (answerTokenCount && answerTokenCount !== meta.count) {
      issues.push(`입력칸 ${meta.count}개 ≠ 정답 토큰 ${answerTokenCount}개`);
    }
    return { input: tokens.filter(Boolean).join('-'), issues };
  }
  if (resolved.type === 'multi_blank') {
    const labels = resolved.multiBlankMeta?.labels || [];
    // 사용자는 각 라벨 칸에 "값"만 입력한다. 정답 문자열에서 라벨별 값을 뽑아낸다.
    let values = H.parseLabeledMultiBlankValuesByKnownLabels(answerText, labels);
    if (!values) {
      const loose = H.parseLabeledMultiBlankValues(answerText)
        || String(answerText).split(/\s*\/\s*/).map((v) => v.trim()).filter(Boolean);
      if (loose.length !== labels.length) {
        issues.push(`입력칸 ${labels.length}개(${labels.join(', ')}) ≠ 정답 항목 ${loose.length}개`);
      }
      values = labels.map((_, i) => loose[i] || '');
    }
    const empty = labels.filter((_, i) => !String(values[i] || '').trim());
    if (empty.length) issues.push(`빈 입력칸 [${empty.join(', ')}] (라벨: ${labels.join(', ')})`);
    const input = labels
      .map((label, i) => ({ label, raw: String(values[i] || '') }))
      .filter((it) => it.raw.trim())
      .map((it) => `${it.label}: ${it.raw.trim()}`)
      .join(' / ');
    return { input, issues };
  }
  return { input: answerText, issues };
}

// 정답 입력값을 살짝 틀리게 바꾼 답안 (순서형: 앞 두 토큰 교환, 복합형: 앞 두 칸 값 교환)
function buildWrongVariant(input, resolved) {
  if (resolved.type === 'sequence' && resolved.sequenceMeta?.mode !== 'unordered_symbol_set') {
    const tokens = String(input).split('-');
    if (tokens.length < 2 || tokens[0] === tokens[1]) return null;
    [tokens[0], tokens[1]] = [tokens[1], tokens[0]];
    return tokens.join('-');
  }
  if (resolved.type === 'multi_blank') {
    const parts = String(input).split(' / ').map((part) => {
      const idx = part.indexOf(': ');
      return [part.slice(0, idx), part.slice(idx + 2)];
    });
    if (parts.length < 2 || parts[0][1] === parts[1][1]) return null;
    [parts[0][1], parts[1][1]] = [parts[1][1], parts[0][1]];
    return parts.map(([label, value]) => `${label}: ${value}`).join(' / ');
  }
  return null;
}

function auditSession(sessionName) {
  const results = [];
  for (const { problem, rawInputType, correct } of loadSession(path.join(BASE, sessionName))) {
    const no = problem.problem_number;
    const issues = [];
    if (correct == null) {
      results.push({ session: sessionName, no, issues: ['answer1.json에 정답 없음'] });
      continue;
    }
    if (!String(correct).trim()) issues.push('정답 텍스트가 비어 있음');
    if (rawInputType == null) issues.push('input_type 누락 (single로 처리됨)');
    const resolved = resolveInputType(problem, correct);
    const { input, issues: inputIssues } = simulateUserInput(correct, resolved);
    issues.push(...inputIssues);
    if (!H.isPracticalAnswerMatch(input, correct, problem)) {
      issues.push(`정답을 입력해도 오답 처리됨 (입력: ${JSON.stringify(input)})`);
    }
    // 반대로, 순서를 뒤집거나 칸 값을 바꿔 넣은 오답은 오답 처리돼야 한다.
    const wrong = buildWrongVariant(input, resolved);
    if (wrong && H.isPracticalAnswerMatch(wrong, correct, problem)) {
      issues.push(`틀린 답도 정답 처리됨 (입력: ${JSON.stringify(wrong)})`);
    }
    if (rawInputType && rawInputType !== 'sequence' && normalizeInputType(rawInputType) !== resolved.type &&
        !(resolved.type === 'sequence' && ['ordered_sequence', 'unordered_symbol_set'].includes(rawInputType))) {
      issues.push(`input_type ${rawInputType} → 화면에서는 ${resolved.type}로 렌더`);
    }
    if (issues.length) results.push({ session: sessionName, no, type: resolved.type, correct, issues });
  }
  return results;
}

const sessions = fs.readdirSync(BASE).filter((d) => fs.existsSync(path.join(BASE, d, 'problem1.json'))).sort();
const all = sessions.flatMap(auditSession);

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(all, null, 2));
} else {
  for (const r of all) {
    console.log(`[${r.session} #${r.no}] (${r.type ?? '-'}) 정답=${JSON.stringify(r.correct)}`);
    for (const i of r.issues) console.log(`   - ${i}`);
  }
  console.log(`\n${sessions.length}개 회차 검사, 문제 있는 문항 ${all.length}개`);
}
process.exitCode = all.length ? 1 : 0;
