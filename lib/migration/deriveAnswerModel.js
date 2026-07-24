const S = (v) => (Array.isArray(v) ? String(v[0] ?? '') : String(v ?? ''));

function tokenize(ans) {
  return String(ans).split(/\s*(?:->|→|,|-|\s)\s*/).map((s) => s.trim()).filter(Boolean);
}

function parseBlanks(ans) {
  const parts = ans.includes('/') ? ans.split('/') : ans.split(/\s*,\s*/);
  const out = [];
  let ordinal = 0;
  const push = (label, value) => out.push({
    ordinal: ordinal++,
    label: String(label).replace(/[.():：]/g, '').trim(),
    value: String(value).trim(),
  });
  for (const partRaw of parts) {
    const part = partRaw.trim();
    if (!part) continue;
    // ①②가 한 파트 안에 여러 개 먼저 분리 ("① GRANT ② ON ③ TO")
    const multi = [...part.matchAll(/([①-⑳])\s*([^\s①-⑳][^①-⑳]*)/g)];
    if (multi.length >= 2) { multi.forEach((mm) => push(mm[1], mm[2])); continue; }
    // 단일 라벨: (가) / 1. / 1) / 1: / ① / ㄱ: / 단어라벨:  뒤에 값
    const m = part.match(/^\s*(\([가-힣ㄱ-ㅎ\d]+\)|[①-⑳]|\d+\s*[.):]|[ㄱ-ㅎ]\s*[:：]|[가-힣A-Za-z][가-힣A-Za-z0-9\s]*\s*[:：])\s*(.+)$/);
    if (m) { push(m[1], m[2]); continue; }
    return null;
  }
  return out.length >= 2 ? out : null;
}

function isExactMode(ans) {
  if (/\n/.test(ans)) return true;                 // 여러 줄 출력
  if (/^\s+\S/m.test(ans) || /\S  +\S/.test(ans)) return true; // 앞공백·이중공백 의미
  if (/^[01]{4,}$/.test(ans.trim())) return true;  // 이진수
  if (/^\d+\.\d*0$/.test(ans.trim())) return true; // 소수점 끝 0
  return false;
}

export function deriveAnswerModel(problem, correctAnswer) {
  const it = String(problem?.input_type || '');
  const q = S(problem?.question_text);
  const category = String(problem?.category || '');
  const isArray = Array.isArray(correctAnswer);
  const answer = S(correctAnswer);
  const acceptedAnswers = isArray ? correctAnswer.map((a) => String(a)) : null;

  const result = { answer, acceptedAnswers, answerTokens: null, answerBlanks: null };

  const selectAll = /모두\s*(고르|골라|쓰)/.test(q);
  const isSeq = it === 'sequence' || it === 'ordered_sequence' || /나열|순서/.test(q) || /(->|→)/.test(answer);
  const blanks = parseBlanks(answer);

  if (it === 'multi_blank' || (blanks && !isSeq && !selectAll)) {
    result.answerKind = 'multi_blank';
    result.answerBlanks = blanks;
    result.matchMode = isExactMode(answer) ? 'exact' : 'normalized';
    return result;
  }
  if (it === 'textarea' || /;\s*$/.test(answer) || (category === 'SQL' && /\b(SELECT|UPDATE|INSERT|DELETE|CREATE|ALTER|GRANT)\b/i.test(answer))) {
    result.answerKind = 'freeform';
    result.matchMode = 'judge';
    return result;
  }
  if (isSeq) {
    result.answerKind = 'sequence';
    result.answerTokens = tokenize(answer);
    result.matchMode = isExactMode(answer) ? 'exact' : 'normalized';
    return result;
  }
  if (it === 'unordered_symbol_set' || (selectAll && /[ㄱ-ㅎ①-⑳]/.test(answer))) {
    result.answerKind = 'set';
    result.answerTokens = tokenize(answer);
    result.matchMode = 'normalized';
    return result;
  }
  result.answerKind = 'single';
  result.matchMode = isExactMode(answer) ? 'exact' : 'normalized';
  return result;
}
