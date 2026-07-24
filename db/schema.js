import { pgTable, uuid, text, integer, jsonb, unique } from 'drizzle-orm/pg-core';

export const sources = pgTable('sources', {
  id: uuid('id').defaultRandom().primaryKey(),
  key: text('key').notNull().unique(),        // 레거시 source_session_id 보존
  title: text('title').notNull(),
  examType: text('exam_type').notNull(),        // written | practical | sqld | aiprompt
  kind: text('kind').notNull(),                 // practical_industrial | gichul | ...
});

export const practicalProblems = pgTable('practical_problems', {
  id: uuid('id').defaultRandom().primaryKey(),
  sourceId: uuid('source_id').notNull().references(() => sources.id),
  problemNo: integer('problem_no').notNull(),
  category: text('category'),                    // 이론 | Code | SQL
  answerKind: text('answer_kind').notNull(),     // single|sequence|set|multi_blank|freeform
  matchMode: text('match_mode').notNull(),       // normalized|exact|judge
  questionText: text('question_text').notNull(),
  examples: text('examples'),
  answer: text('answer').notNull(),
  acceptedAnswers: text('accepted_answers').array(),
  answerTokens: text('answer_tokens').array(),
  answerBlanks: jsonb('answer_blanks'),
  answerFormatHint: text('answer_format_hint'),
  inputType: text('input_type'),                 // 원본 보존 (감사·재유도 대비)
  comment: text('comment'),
  hint: text('hint'),
}, (t) => ({ uq: unique().on(t.sourceId, t.problemNo) }));

export const problemChoices = pgTable('problem_choices', {
  id: uuid('id').defaultRandom().primaryKey(),
  problemId: uuid('problem_id').notNull().references(() => practicalProblems.id),
  marker: text('marker').notNull(),
  text: text('text').notNull(),
  ordinal: integer('ordinal').notNull(),
});
