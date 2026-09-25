import questions from '../../src/data/questions.json';

export const REPORT_EXCLUDED_EQUIPMENT_IDS = new Set([33, 38, 39, 40, 44, 64, 65]);

export const reportQuestions = questions;
export const reportOfficeQuestions = questions.filter(
  (question) => !REPORT_EXCLUDED_EQUIPMENT_IDS.has(Number(question.id)),
);
export const reportUnitQuestions = questions.filter(
  (question) => REPORT_EXCLUDED_EQUIPMENT_IDS.has(Number(question.id)),
);