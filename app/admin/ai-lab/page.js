import { loadConceptTags, buildProblemIndex } from '@/lib/conceptTags';
import { loadPracticalDatasetMaps, practicalSessionLabel } from '@/app/practical/_lib/practicalData';
import AiLabClient from './AiLabClient';

const CATEGORY_ORDER = ['SQL', 'Code', '이론'];

function compareAnchors(left, right) {
  const categoryDelta = CATEGORY_ORDER.indexOf(left.category) - CATEGORY_ORDER.indexOf(right.category);
  if (categoryDelta !== 0) return categoryDelta;
  const conceptDelta = String(left.concept).localeCompare(String(right.concept), 'ko');
  if (conceptDelta !== 0) return conceptDelta;
  const sessionDelta = String(left.sessionId).localeCompare(String(right.sessionId));
  if (sessionDelta !== 0) return sessionDelta;
  return Number(left.problemNumber) - Number(right.problemNumber);
}

function createBenchmark(index, count = 20) {
  const pools = new Map(CATEGORY_ORDER.map((category) => [category, []]));
  index.forEach((row) => {
    if (pools.has(row.category)) pools.get(row.category).push(row);
  });
  pools.forEach((rows) => rows.sort(compareAnchors));

  const usedConcepts = new Set();
  const selected = [];
  while (selected.length < count) {
    let added = false;
    for (const category of CATEGORY_ORDER) {
      const pool = pools.get(category) || [];
      const nextIndex = pool.findIndex((row) => !usedConcepts.has(row.concept));
      const next = nextIndex >= 0 ? pool.splice(nextIndex, 1)[0] : pool.shift();
      if (!next) continue;
      selected.push(next);
      usedConcepts.add(next.concept);
      added = true;
      if (selected.length >= count) break;
    }
    if (!added) break;
  }
  return selected;
}

export default async function AiLabPage() {
  const tags = await loadConceptTags();
  const index = await buildProblemIndex(tags);
  const categoryCounts = CATEGORY_ORDER.map((category) => ({
    category,
    count: index.filter((row) => row.category === category).length,
  }));
  const benchmark = createBenchmark(index, 20);
  const cache = new Map();

  const anchors = await Promise.all(benchmark.map(async (anchor) => {
    if (!cache.has(anchor.sessionId)) cache.set(anchor.sessionId, loadPracticalDatasetMaps(anchor.sessionId));
    const dataset = await cache.get(anchor.sessionId);
    const question = dataset?.problemsByNo?.get(Number(anchor.problemNumber));
    const answer = dataset?.answersByNo?.get(Number(anchor.problemNumber));
    const comment = dataset?.commentsByNo?.get(Number(anchor.problemNumber));
    return {
      ...anchor,
      sessionLabel: practicalSessionLabel(anchor.sessionId),
      questionText: String(question?.question_text || ''),
      examples: String(question?.examples || ''),
      answer: String(answer || ''),
      hasComment: Boolean(String(comment || '').trim()),
      ready: Boolean(question?.question_text && answer),
    };
  }));

  return (
    <AiLabClient
      corpus={{ total: index.length, categoryCounts, conceptCount: new Set(index.map((row) => row.concept)).size }}
      anchors={anchors}
    />
  );
}
