export const ENTITY_SHIELD_FILES: Record<string, string> = {
  'BAJA CALIFORNIA': 'Baja California.png',
  'BAJA CALIFORNIA SUR': 'Baja California sur.png',
  CAMPECHE: 'CAMPECHE.png',
  'CIUDAD DE MEXICO': 'CDMX.webp',
  CHIAPAS: 'CHIAPAS .png',
  COLIMA: 'COLIMA.png',
  'ESTADO DE MEXICO': 'EdoMex.png',
  MEXICO: 'EdoMex.png',
  GUANAJUATO: 'guanajuato.png',
  GUERRERO: 'Guerrero.png',
  HIDALGO: 'hidalgo .png',
  MICHOACAN: 'Michoacán.png',
  'MICHOACAN DE OCAMPO': 'Michoacán.png',
  MORELOS: 'MORELOS.png',
  NAYARIT: 'NAYARIT.png',
  OAXACA: 'OAXACA.png',
  PUEBLA: 'Puebla.png',
  'QUINTANA ROO': 'Quintana Roo.png',
  'SAN LUIS POTOSI': 'San luis potosí.jpg',
  SINALOA: 'sinaloa.png',
  SONORA: 'SONORA.png',
  TABASCO: 'TABASCO.png',
  TAMAULIPAS: 'TAMAULIPAS .png',
  TLAXCALA: 'TLAXCALA.png',
  'VERACRUZ DE IGNACIO DE LA LLAVE': 'Veracruz.png',
  VERACRUZ: 'Veracruz.png',
  YUCATAN: 'yucatan.png',
  ZACATECAS: 'Zacatecas.png',
};

const shieldAssets = import.meta.glob('../assets/logos-estados/*', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

export function getEntityShield(entityName: string): string | undefined {
  const normalized = entityName.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
  const filename = ENTITY_SHIELD_FILES[normalized];
  if (!filename) return undefined;
  const assetKey = Object.keys(shieldAssets).find((key) => key.endsWith(`/${filename}`));
  return assetKey ? shieldAssets[assetKey] : undefined;
}
