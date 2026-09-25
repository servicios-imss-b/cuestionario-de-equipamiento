import { EquipmentItem } from '../types.ts';
import questions from './questions.json';

export const UNIT_LEVEL_EQUIPMENT_QUESTIONS = new Set([
	'Termo congelante integrado para transporte y conservación de vacunas',
	'Paquetes refrigerantes para termo',
	'Termómetro de vástago',
	'Vaso contenedor  de vacunas',
	'Refrigerador para vacunas',
	'Refrigerador para farmacia',
	'Congelador para paquetes fríos'
]);

export function isUnitLevelEquipmentQuestion(question: string): boolean {
	return UNIT_LEVEL_EQUIPMENT_QUESTIONS.has(question);
}

const unitLevelQuestions = questions.filter((item) => isUnitLevelEquipmentQuestion(item.name));
const officeLevelQuestions = questions.filter((item) => !isUnitLevelEquipmentQuestion(item.name));
export const EQUIPMENT_CATALOG: EquipmentItem[] = [...unitLevelQuestions, ...officeLevelQuestions];

const equipmentByName = new Map(EQUIPMENT_CATALOG.map((item) => [item.name, item]));

export function getEquipmentId(question: string): string | null {
	return equipmentByName.get(question)?.id.toString() ?? null;
}

export function getEquipmentColumn(id: string | number): string {
	return `p_${id}`;
}
