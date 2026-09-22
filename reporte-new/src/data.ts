import { createClient } from '@supabase/supabase-js';
import units from '../../src/data/units.json';
import questions from '../../src/data/questions.json';
import type { CluesGeoItem, DataRow, TablasFormulario } from './types';

interface ExpectedUnit {
  clues: string;
  name: string;
  entity: string;
}

const correctedUnitNames = new Map(
  (units as ExpectedUnit[]).map((unit) => [normalize(unit.clues), String(unit.name ?? '').trim()]),
);

interface SupabaseRow {
  fecha_registro: string | null;
  tipo_registro: 'unidad' | 'respuesta' | 'consultorio' | 'horario';
  entidad: string | null;
  usuario_nombre: string | null;
  usuario_email: string | null;
  clues_imb: string | null;
  nombre_de_la_unidad: string | null;
  internet: string | null;
  consultorios: number | null;
  consultorio: number | null;
  pregunta: string | null;
  valor: number | null;
  turno: string | null;
  turno_consultorio: string | null;
  habilitado: boolean | null;
  causas_inhabilitacion: string | null;
  medicos_generales: number | null;
  catalogo_version: number | null;
  [column: string]: unknown;
}

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  : null;

export interface StorageUsageRow {
  tabla: string;
  bytes: number;
  tamanoLegible: string;
}

export async function fetchStorageUsage(): Promise<StorageUsageRow[]> {
  if (!supabase) throw new Error('Supabase no está configurado');
  const { data, error } = await supabase.rpc('obtener_uso_almacenamiento');
  if (error) throw new Error(`No fue posible consultar el uso de almacenamiento: ${error.message}`);
  return (data ?? []).map((row: { tabla: string; bytes: number; tamano_legible: string }) => ({
    tabla: row.tabla,
    bytes: Number(row.bytes),
    tamanoLegible: row.tamano_legible,
  }));
}
const EQUIPMENT_QUESTION_COUNT = questions.length;

function normalize(value: unknown): string {
  return String(value ?? '').trim().toUpperCase();
}

function correctedUnitName(clues: unknown, fallback: unknown): string {
  return correctedUnitNames.get(normalize(clues)) ?? String(fallback ?? '').trim();
}

function applyCorrectedUnitName(row: DataRow): DataRow {
  return {
    ...row,
    nombre_de_la_unidad: correctedUnitName(row.clues_imb ?? row.clues, row.nombre_de_la_unidad),
  };
}

function questionKey(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function scheduleColumns(selectedTurn: unknown, storedSchedule: unknown) {
  const schedules = { Matutino: [] as string[], Vespertino: [] as string[] };
  const dayLabels: Record<string, string> = {
    lunes: 'lunes',
    martes: 'martes',
    miercoles: 'miércoles',
    jueves: 'jueves',
    viernes: 'viernes',
    sabado: 'sábado',
    domingo: 'domingo',
  };
  if (typeof storedSchedule === 'string') {
    for (const value of storedSchedule.split(',')) {
      const match = value.trim().toLowerCase().match(
        /^(matutino|vespertino)-(lunes|martes|miercoles|jueves|viernes|sabado|domingo)(-med)?$/,
      );
      if (!match) continue;
      const turn = match[1] === 'matutino' ? 'Matutino' : 'Vespertino';
      schedules[turn].push(`${dayLabels[match[2]]}${match[3] ? '-médico' : ''}`);
    }
  }

  const matutino = schedules.Matutino.join(', ');
  const vespertino = schedules.Vespertino.join(', ');
  const ambos = [
    matutino ? `Matutino: ${matutino}` : '',
    vespertino ? `Vespertino: ${vespertino}` : '',
  ].filter(Boolean).join(' | ');

  return {
    Matutino: selectedTurn === 'Matutino' ? matutino || null : null,
    Vespertino: selectedTurn === 'Vespertino' ? vespertino || null : null,
    Ambos: selectedTurn === 'Ambos' ? ambos || null : null,
  };
}

// La normalizacion reemplazo la tabla plana `respuestas` por unidades/consultorios/
// respuestas_equipamiento; reconstruimos filas con la forma de SupabaseRow para no
// tocar el resto del pipeline de agregacion mas abajo.
async function fetchAllRows<T>(client: NonNullable<typeof supabase>, table: string, select: string): Promise<T[]> {
  const pageSize = 1000;
  const out: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await client.from(table).select(select).range(from, from + pageSize - 1);
    if (error) throw new Error(`No fue posible consultar ${table} de Supabase: ${error.message}`);
    const page = (data ?? []) as T[];
    out.push(...page);
    if (page.length < pageSize) break;
  }
  return out;
}

async function fetchNormalizedRows(client: NonNullable<typeof supabase>): Promise<SupabaseRow[]> {
  const [unidadesData, consultoriosData, equipamientoData] = await Promise.all([
    fetchAllRows<any>(client, 'unidades', '*, usuarios(email, nombre)'),
    fetchAllRows<any>(client, 'consultorios', '*, usuarios(email, nombre)'),
    fetchAllRows<any>(client, 'respuestas_equipamiento', '*'),
  ]);

  const equipmentByOffice = new Map<number, Map<number, number>>();
  for (const eq of equipamientoData) {
    if (!equipmentByOffice.has(eq.consultorio_id)) equipmentByOffice.set(eq.consultorio_id, new Map());
    equipmentByOffice.get(eq.consultorio_id)!.set(Number(eq.pregunta_id), Number(eq.cantidad));
  }

  const unidadByClues = new Map<string, any>(
    unidadesData.map((unidad) => [normalize(unidad.clues_imb), unidad]),
  );

  const unidadRows: SupabaseRow[] = unidadesData.map((u) => ({
    usuario_id: u.usuario_id ?? null,
    consultorio_id: null,
    fecha_registro: u.fecha_registro ?? null,
    tipo_registro: 'unidad',
    entidad: u.entidad ?? null,
    usuario_nombre: u.usuarios?.nombre ?? null,
    usuario_email: u.usuarios?.email ?? null,
    clues_imb: u.clues_imb ?? null,
    nombre_de_la_unidad: correctedUnitName(u.clues_imb, u.nombre_de_la_unidad),
    internet: u.internet ?? null,
    consultorios: u.consultorios ?? null,
    consultorio: null,
    pregunta: null,
    valor: null,
    turno: null,
    turno_consultorio: null,
    habilitado: null,
    causas_inhabilitacion: null,
    medicos_generales: null,
    catalogo_version: null,
    }));

  const consultorioRows: SupabaseRow[] = consultoriosData.map((c) => {
    const unidad = unidadByClues.get(normalize(c.unidad_clues));
    const row: SupabaseRow = {
      usuario_id: c.usuario_id ?? null,
      consultorio_id: c.id ?? null,
      fecha_registro: c.fecha_registro ?? null,
      tipo_registro: 'consultorio',
      entidad: unidad?.entidad ?? null,
      usuario_nombre: c.usuarios?.nombre ?? null,
      usuario_email: c.usuarios?.email ?? null,
      clues_imb: c.unidad_clues ?? null,
      nombre_de_la_unidad: correctedUnitName(c.unidad_clues, unidad?.nombre_de_la_unidad),
      internet: unidad?.internet ?? null,
      consultorios: unidad?.consultorios ?? null,
      consultorio: c.numero ?? null,
      pregunta: null,
      valor: null,
      turno: c.turno ?? null,
      turno_consultorio: c.turno_consultorio ?? null,
      habilitado: c.habilitado ?? null,
      causas_inhabilitacion: c.causas_inhabilitacion ?? null,
      medicos_generales: c.medicos_generales ?? null,
      catalogo_version: c.catalogo_version ?? null,
    };
    const equipment = equipmentByOffice.get(c.id);
    for (const question of questions) {
      row[`p_${question.id}`] = equipment?.get(Number(question.id)) ?? null;
    }
    return row;
  });

  return [...unidadRows, ...consultorioRows];
}

async function fetchLiveAdvanceTables(): Promise<{
  baseAn: DataRow[];
  resultado: DataRow[];
  resumen: DataRow[];
  resumenEntidad: DataRow[];
  tablaAvance: DataRow[];
  tablaEntidades: DataRow[];
  tablaUnidadesAvance: DataRow[];
  faltantes: DataRow[];
  faltantesPorEstados: DataRow[];
  tablaFaltantesPorEstados: DataRow[];
  scriptLastRunAt?: string;
}> {
  if (!supabase) throw new Error('Supabase no está configurado para calcular el avance');

  const expectedUnits = units as ExpectedUnit[];
  const expectedByClues = new Map<string, ExpectedUnit>(
    expectedUnits.map((unit) => [normalize(unit.clues), {
      clues: normalize(unit.clues),
      name: String(unit.name ?? '').trim(),
      entity: normalize(unit.entity),
    }]),
  );
  const rows: SupabaseRow[] = await fetchNormalizedRows(supabase);

  const configByClues = new Map<string, SupabaseRow>();
  const officeByKey = new Map<string, SupabaseRow>();
  const responsesByClues = new Map<string, {
    responded: number;
    answeredWithValue: number;
    maxOffice: number | null;
  }>();
  const responseRows: SupabaseRow[] = [];

  const registerResponse = (row: SupabaseRow) => {
    const clues = normalize(row.clues_imb);
    responseRows.push(row);
    const current = responsesByClues.get(clues) ?? {
      responded: 0,
      answeredWithValue: 0,
      maxOffice: null,
    };
    current.responded += 1;
    if (row.valor !== null) current.answeredWithValue += 1;
    if (row.consultorio !== null && Number.isFinite(Number(row.consultorio))) {
      const office = Number(row.consultorio);
      current.maxOffice = current.maxOffice === null ? office : Math.max(current.maxOffice, office);
    }
    responsesByClues.set(clues, current);
  };

  for (const row of rows) {
    const clues = normalize(row.clues_imb);
    if (!clues || !expectedByClues.has(clues)) continue;
    if (row.tipo_registro === 'unidad') {
      configByClues.set(clues, row);
      continue;
    }
    if (row.tipo_registro === 'consultorio' && row.consultorio !== null) {
      officeByKey.set(`${clues}::${row.consultorio}`, row);
      for (const question of questions) {
        const value = row[`p_${question.id}`];
        if (value === null || value === undefined) continue;
        registerResponse({ ...row, pregunta: question.name, valor: Number(value) });
      }
      continue;
    }
    if (row.tipo_registro !== 'respuesta') continue;
    registerResponse(row);
  }

  const questionColumns = questions.map((question) => `${questionKey(question.name)}_consultorio`);
  const questionColumnByName = new Map(
    questions.map((question) => [normalize(question.name), `${questionKey(question.name)}_consultorio`]),
  );
  const resultByOffice = new Map<string, DataRow>();

  const ensureOfficeResult = (clues: string, office: number, row: SupabaseRow): DataRow | null => {
    const unit = expectedByClues.get(clues);
    if (!unit) return null;
    const key = `${clues}::${office}`;
    const config = configByClues.get(clues);
    const officeConfig = officeByKey.get(key);
    const schedules = scheduleColumns(officeConfig?.turno_consultorio, officeConfig?.turno);
    const result: DataRow = resultByOffice.get(key) ?? {
      entidad: unit.entity,
      clues_imb: clues,
      nombre_de_la_unidad: unit.name,
      internet: config?.internet ?? null,
      consultorios: config?.consultorios ?? null,
      consultorio: office,
      Matutino: schedules.Matutino,
      Vespertino: schedules.Vespertino,
      Ambos: schedules.Ambos,
      habilitado: officeConfig?.habilitado ?? null,
      causas_inhabilitacion: officeConfig?.causas_inhabilitacion ?? null,
      medicos_generales: officeConfig?.medicos_generales ?? null,
    };
    resultByOffice.set(key, result);
    return result;
  };

  for (const [clues, config] of configByClues) {
    const officeCount = Number(config.consultorios ?? 0);
    if (officeCount === 0) {
      ensureOfficeResult(clues, 0, config);
      continue;
    }
    for (let office = 1; office <= officeCount; office += 1) {
      ensureOfficeResult(clues, office, config);
    }
  }

  for (const row of responseRows) {
    const clues = normalize(row.clues_imb);
    if (row.consultorio === null || row.consultorio <= 0) continue;
    const result = ensureOfficeResult(clues, row.consultorio, row);
    if (!result) continue;
    const column = questionColumnByName.get(normalize(row.pregunta))
      ?? `${questionKey(row.pregunta)}_consultorio`;
    result[column] = row.valor;
  }

  const resultado = [...resultByOffice.values()].map((row) => {
    const complete = { ...row };
    for (const column of questionColumns) {
      if (!(column in complete)) complete[column] = null;
    }
    return complete;
  });

  const resumen = [...responsesByClues.entries()].map(([clues, response]) => {
    const unit = expectedByClues.get(clues);
    const config = configByClues.get(clues);
    return {
      clues_imb: clues,
      entidad: unit?.entity ?? normalize(config?.entidad),
      nombre_de_la_unidad: unit?.name ?? String(config?.nombre_de_la_unidad ?? ''),
      internet: config?.internet ?? null,
      consultorios: config?.consultorios ?? null,
      consultorio: config?.consultorios ?? response.maxOffice,
    };
  });

  const unitGeneralColumns = new Set([
    'internet',
    'consultorios',
    'habilitado',
    'causas_inhabilitacion',
    'medicos_generales',
    'Matutino',
    'Vespertino',
    'Ambos',
  ]);
  const resumenEntidadMap = new Map<string, DataRow>();
  for (const row of resultado) {
    const entidad = String(row.entidad ?? 'Sin entidad');
    const aggregate = resumenEntidadMap.get(entidad) ?? Object.fromEntries([
      ['entidad', entidad],
      ['consultorio', 0],
      ['medicos_generales', 0],
      ...questionColumns.map((column) => [column, null]),
    ]);
    for (const [column, value] of Object.entries(row)) {
      if (column === 'entidad' || column === 'clues_imb' || column === 'nombre_de_la_unidad' || column === 'consultorio' || unitGeneralColumns.has(column)) continue;
      if (typeof value === 'number') aggregate[column] = Number(aggregate[column] ?? 0) + value;
    }
    aggregate.medicos_generales = Number(aggregate.medicos_generales ?? 0) + Number(row.medicos_generales ?? 0);
    aggregate.consultorio = Number(aggregate.consultorio ?? 0) + 1;
    resumenEntidadMap.set(entidad, aggregate);
  }

  const resumenEntidad = [...resumenEntidadMap.values()];

  const faltantes = resultado.flatMap((row) => {
    const missing = questionColumns
      .filter((column) => row[column] === null || row[column] === undefined)
      .map((column) => column.replace(/_consultorio$/, ''));
    if (!missing.length) return [];
    return [{
      entidad: row.entidad,
      clues_imb: row.clues_imb,
      nombre_de_la_unidad: row.nombre_de_la_unidad,
      consultorio: row.consultorio,
      n_faltantes: missing.length,
      preguntas_faltantes: missing.join(', '),
    }];
  });

  const totals = new Map<string, { total: number; answered: number }>();
  const tablaUnidadesAvance: DataRow[] = [];
  const entityCompletion = new Map<string, {
    consultorios: number;
    respondidas: number;
    respondidasConValor: number;
    esperadas: number;
    unidades: number;
    unidadesCero: number;
  }>();

  for (const [clues, unit] of expectedByClues) {
    const response = responsesByClues.get(clues);
    const config = configByClues.get(clues);
    const responded = response?.responded ?? 0;
    const configuredOffices = config?.consultorios == null ? null : Number(config.consultorios);
    const officeCount = configuredOffices ?? response?.maxOffice ?? null;
    const expected = officeCount === null ? 0 : officeCount * EQUIPMENT_QUESTION_COUNT;
    const percentage = officeCount === 0
      ? 100
      : (expected > 0 ? Math.min(100, +((responded / expected) * 100).toFixed(1)) : 0);

    tablaUnidadesAvance.push({
      clues,
      entidad: unit.entity,
      nombre_de_la_unidad: unit.name,
      consultorios: officeCount,
      respondidas: responded,
      esperadas: expected,
      porcentaje: percentage,
    });

    const completion = entityCompletion.get(unit.entity) ?? {
      consultorios: 0,
      respondidas: 0,
      respondidasConValor: 0,
      esperadas: 0,
      unidades: 0,
      unidadesCero: 0,
    };
    completion.consultorios += officeCount ?? 0;
    completion.respondidas += responded;
    completion.respondidasConValor += response?.answeredWithValue ?? 0;
    completion.esperadas += expected;
    completion.unidades += 1;
    if (officeCount === 0) completion.unidadesCero += 1;
    entityCompletion.set(unit.entity, completion);

    const entity = unit.entity;
    const current = totals.get(entity) ?? { total: 0, answered: 0 };
    current.total += 1;
    if (response || configuredOffices === 0) current.answered += 1;
    totals.set(entity, current);
  }

  const tablaAvance = [...totals.entries()]
    .map(([entidad, counts]) => ({
      entidad,
      total_unidades: counts.total,
      unidades_respondieron: counts.answered,
      porcentaje: counts.total > 0 ? +((counts.answered / counts.total) * 100).toFixed(1) : 0,
    }))
    .sort((first, second) => Number(second.porcentaje) - Number(first.porcentaje));

  const tablaEntidades = [...entityCompletion.entries()]
    .map(([entidad, counts]) => {
      const allUnitsExplicitlyZero = counts.unidades > 0 && counts.unidadesCero === counts.unidades;
      const percentage = counts.esperadas > 0
        ? Math.min(100, +((counts.respondidas / counts.esperadas) * 100).toFixed(1))
        : (allUnitsExplicitlyZero ? 100 : 0);

      return {
        entidad,
        consultorios: counts.consultorios,
        respondidas: counts.respondidas,
        respondidas_con_valor: counts.respondidasConValor,
        esperadas: counts.esperadas,
        unidades: counts.unidades,
        unidades_cero_explicit: counts.unidadesCero,
        porcentaje: percentage,
        porcentaje_con_valor: counts.esperadas > 0
          ? Math.min(100, +((counts.respondidasConValor / counts.esperadas) * 100).toFixed(1))
          : (allUnitsExplicitlyZero ? 100 : 0),
      };
    })
    .sort((first, second) => Number(second.porcentaje) - Number(first.porcentaje));

  tablaUnidadesAvance.sort((first, second) => Number(second.porcentaje) - Number(first.porcentaje));

  const faltantesPorEstados = [...expectedByClues.entries()]
    .filter(([clues]) => !responsesByClues.has(clues) && configByClues.get(clues)?.consultorios !== 0)
    .map(([clues, unit]) => ({
      entidad: unit.entity,
      clues_imb: clues,
      nombre_de_la_unidad: unit.name,
    }))
    .sort((first, second) => String(first.entidad).localeCompare(String(second.entidad)));

  const missingByEntity = new Map<string, number>();
  for (const row of faltantesPorEstados) {
    const entidad = String(row.entidad);
    missingByEntity.set(entidad, (missingByEntity.get(entidad) ?? 0) + 1);
  }
  const tablaFaltantesPorEstados = [...missingByEntity.entries()]
    .map(([entidad, cluesFaltantes]) => ({ entidad, clues_faltantes: cluesFaltantes }))
    .sort((first, second) => second.clues_faltantes - first.clues_faltantes);

  const cluesWithConsultorios = new Set(
    rows
      .filter((row) => row.tipo_registro === 'consultorio')
      .map((row) => normalize(row.clues_imb)),
  );
  const baseAnRows = rows.filter(
    (row) => row.tipo_registro === 'consultorio' || !cluesWithConsultorios.has(normalize(row.clues_imb)),
  ).map((row) => applyCorrectedUnitName(row as unknown as DataRow));

  const scriptLastRunAt = rows
    .map((row) => row.fecha_registro)
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1);

  return {
    baseAn: baseAnRows,
    resultado,
    resumen,
    resumenEntidad,
    tablaAvance,
    tablaEntidades,
    tablaUnidadesAvance,
    faltantes,
    faltantesPorEstados,
    tablaFaltantesPorEstados,
    scriptLastRunAt,
  };
}

async function fetchJson<T>(filename: string): Promise<T | null> {
  const ts = Date.now();
  try {
    const response = await fetch(`${import.meta.env.BASE_URL}${filename}?_cb=${ts}`);
    if (!response.ok) return null;
    return await response.json() as T;
  } catch {
    return null;
  }
}

async function fetchCluesGeo(): Promise<CluesGeoItem[]> {
  const payload = await fetchJson<unknown[]>('clues_geo.json');
  if (!Array.isArray(payload)) return [];
  return payload.filter(
    (r) => r && typeof r === 'object' && typeof (r as Record<string, unknown>).lat === 'number' && typeof (r as Record<string, unknown>).lng === 'number' && (r as Record<string, unknown>).clues_imb,
  ) as CluesGeoItem[];
}

export async function cargarTablasFormulario(): Promise<{ tablas: TablasFormulario; fetchedAt: Date }> {
  const [cluesGeo, liveTables] = await Promise.all([
    fetchCluesGeo(),
    fetchLiveAdvanceTables(),
  ]);

  const correctedCluesGeo = cluesGeo.map((row) => ({
    ...row,
    nombre_de_la_unidad: correctedUnitName(row.clues_imb, row.nombre_de_la_unidad),
  }));

  const expectedUnits = units as ExpectedUnit[];
  const expectedEntities = new Set(expectedUnits.map((unit) => normalize(unit.entity)));

  const tablas: TablasFormulario = {
    baseClues: expectedUnits.map((unit) => normalize(unit.clues)),
    baseMeta: {
      cluesTotal: expectedUnits.length,
      entidadesEsperadas: expectedEntities.size,
      scriptLastRunAt: liveTables.scriptLastRunAt,
    },
    baseAn: liveTables.baseAn,
    resultado: liveTables.resultado,
    resumen: liveTables.resumen,
    resumenEntidad: liveTables.resumenEntidad,
    tablaAvance: liveTables.tablaAvance,
    tablaEntidades: liveTables.tablaEntidades,
    tablaUnidadesAvance: liveTables.tablaUnidadesAvance,
    faltantesPorEstados: liveTables.faltantesPorEstados,
    tablaFaltantesPorEstados: liveTables.tablaFaltantesPorEstados,
    cluesGeo: correctedCluesGeo,
    faltantes: liveTables.faltantes,
  };

  return { tablas, fetchedAt: new Date() };
}
