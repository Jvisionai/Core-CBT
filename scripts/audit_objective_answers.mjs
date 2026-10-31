// 객관식 데이터셋(필기/SQLD/AI 프롬프트/100문제/PDF팩) 정답 구조 검증.
// - 정답 인덱스가 보기 범위 안인지, correct_answer_text가 해당 보기와 같은지
// - problem/answer/comment 파일 간 문항 번호가 일치하는지
//
// 사용법: node scripts/audit_objective_answers.mjs
import fs from 'fs';
import path from 'path';

const ROOT = path.join(process.cwd(), 'datasets');
const stripBom = (s) => String(s || '').replace(/^﻿/, '');
const readJson = (f) => JSON.parse(stripBom(fs.readFileSync(f, 'utf8')));
const flat = (data, key) => (Array.isArray(data) ? data.flatMap((s) => (Array.isArray(s?.[key]) ? s[key] : [])) : []);
const norm = (v) => String(v ?? '').normalize('NFKC').replace(/\s+/g, ' ').trim();

function findSessionDirs(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const full = path.join(dir, entry.name);
    if (fs.existsSync(path.join(full, 'answer1.json'))) out.push(full);
    else out.push(...findSessionDirs(full));
  }
  return out;
}

const issues = [];
const report = (dir, no, msg) => issues.push(`[${path.relative(ROOT, dir)} #${no}] ${msg}`);

for (const dir of findSessionDirs(ROOT).sort()) {
  if (dir.includes(`${path.sep}practicalIndustrial${path.sep}`)) continue; // 실기는 audit_practical_answers.mjs
  const problemFile = ['problem1.json', 'problem1.temp3.json'].map((f) => path.join(dir, f)).find((f) => fs.existsSync(f));
  if (!problemFile) continue;
  const problems = flat(readJson(problemFile), 'problems');
  const answers = flat(readJson(path.join(dir, 'answer1.json')), 'answers');
  const commentFile = path.join(dir, 'comment1.json');
  const comments = fs.existsSync(commentFile) ? flat(readJson(commentFile), 'comments') : [];

  const answerByNo = new Map();
  for (const a of answers) {
    if (answerByNo.has(a.problem_number)) report(dir, a.problem_number, '정답 중복');
    answerByNo.set(a.problem_number, a);
  }
  const commentNos = new Set(comments.map((c) => c.problem_number));
  const problemNos = new Set();

  for (const p of problems) {
    const no = p.problem_number;
    if (problemNos.has(no)) report(dir, no, '문항 번호 중복');
    problemNos.add(no);
    const a = answerByNo.get(no);
    if (!a) { report(dir, no, '정답 없음'); continue; }
    if (comments.length && !commentNos.has(no)) report(dir, no, '해설 없음');
    if (!String(p.question_text ?? '').trim()) report(dir, no, '문제 텍스트 비어 있음');

    const options = Array.isArray(p.options) ? p.options : [];
    if (options.length === 0) continue; // 주관식
    if (options.some((o) => !norm(o))) report(dir, no, '빈 보기 있음');
    if (new Set(options.map(norm)).size !== options.length) report(dir, no, '중복 보기 있음');

    // 화면은 correct_answer_text와 보기 문자열을 === 로 비교한다 (Quiz.js checkCorrect).
    const exact = options.indexOf(a.correct_answer_text);
    if (exact < 0) {
      const loose = options.findIndex((o) => norm(o) === norm(a.correct_answer_text));
      report(dir, no, loose >= 0
        ? `정답 텍스트가 ${loose + 1}번 보기와 공백/문자 차이로 달라 정답을 골라도 오답 처리됨`
        : `정답 텍스트와 일치하는 보기가 없어 정답을 고를 수 없음: "${a.correct_answer_text}"`);
      continue;
    }
    if (a.correct_answer_index !== exact) {
      report(dir, no, `correct_answer_index(${a.correct_answer_index})가 정답 보기 위치(${exact})와 다름`);
    }
  }
  for (const no of answerByNo.keys()) if (!problemNos.has(no)) report(dir, no, '문제 없이 정답만 있음');
}

for (const line of issues) console.log(line);
console.log(`\n문제 있는 항목 ${issues.length}개`);
process.exitCode = issues.length ? 1 : 0;
