import { createClient } from '@supabase/supabase-js';
import { MexicanEntity, MedicalUnit, QuestionAnswer, EquipmentItem, SyncQueueItem, UnitGeneralData } from '../types.ts';
import { EQUIPMENT_CATALOG, getEquipmentId } from '../data/equipmentCatalog.ts';
import {
  DISABLED_CAUSE_CONFIRMATION_QUESTION,
  DISABLED_OFFICE_CAUSES,
  GENERAL_DOCTOR_COUNT_QUESTION,
  getDisabledCauseFromQuestion,
  getDoctorAvailabilityQuestion,
  getOfficeScheduleQuestion,
  OFFICE_ENABLED_QUESTION,
  parseDoctorAvailabilityQuestion,
  parseOfficeScheduleQuestion,
  parseStoredSchedule,
  WEEK_DAYS,
  type OperationalTurn
} from '../data/officeConfiguration.ts';

const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '') + '/api';
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase = supabaseUrl && supabaseAnonKey ? createClient(supabaseUrl, supabaseAnonKey) : null;
const adminAuth = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
        storageKey: 'imss-admin-auth'
      }
    })
  : null;

function requireSupabase() {
  if (!supabase) throw new Error('Supabase no está configurado');
  return supabase;
}

function parseStoredCauses(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((cause): cause is string => typeof cause === 'string');
  if (typeof value !== 'string') return [];
  return value.split(',').map((cause) => cause.trim()).filter(Boolean);
}

// Crea o actualiza el usuario por email y devuelve su id; null si no hay email.
async function upsertUsuario(client: NonNullable<typeof supabase>, email?: string, nombre?: string): Promise<number | null> {
  const normalizedEmail = email?.trim().toLowerCase();
  if (!normalizedEmail) return null;
  const { data, error } = await client
    .from('usuarios')
    .upsert({ email: normalizedEmail, nombre }, { onConflict: 'email' })
    .select('id')
    .single();
  if (error) throw error;
  return data.id;
}

async function saveAnswerRow(payload: Parameters<typeof saveSingleAnswer>[0]) {
  const client = requireSupabase();
  const normalizedClues = payload.clues.trim().toUpperCase();
  const cause = getDisabledCauseFromQuestion(payload.pregunta);
  const schedule = parseOfficeScheduleQuestion(payload.pregunta);
  const doctorAvailability = parseDoctorAvailabilityQuestion(payload.pregunta);

  if (schedule || doctorAvailability) {
    const slot = schedule || doctorAvailability!;
    const turnAndDay = `${slot.turn} - ${slot.day}`;
    const timestamp = new Date().toISOString();
    const { error } = await client.rpc('guardar_horario_consultorio', {
      p_clues: normalizedClues,
      p_consultorio: payload.numeroConsultorio,
      p_slot: turnAndDay,
      p_campo: schedule ? 'habilitado' : 'medico_disponible',
      p_valor: payload.valor === 1,
      p_usuario_email: payload.usuarioEmail,
      p_usuario_nombre: payload.usuarioNombre
    });
    if (error) throw error;
    return timestamp;
  }

  const isOfficeConfiguration = payload.pregunta === OFFICE_ENABLED_QUESTION
    || payload.pregunta === GENERAL_DOCTOR_COUNT_QUESTION
    || payload.pregunta === DISABLED_CAUSE_CONFIRMATION_QUESTION
    || Boolean(cause);

  if (isOfficeConfiguration) {
    const timestamp = new Date().toISOString();
    const existing = await client.from('consultorios').select('*')
      .eq('unidad_clues', normalizedClues)
      .eq('numero', payload.numeroConsultorio)
      .maybeSingle();
    if (existing.error) throw existing.error;
    if (payload.pregunta === DISABLED_CAUSE_CONFIRMATION_QUESTION) return timestamp;

    const selectedCauses = new Set<string>(parseStoredCauses(existing.data?.causas_inhabilitacion));
    if (cause) {
      if (payload.valor === 1) selectedCauses.add(cause.label);
      else selectedCauses.delete(cause.label);
    }

    const enabled = payload.pregunta === OFFICE_ENABLED_QUESTION
      ? payload.valor === 1
      : existing.data?.habilitado ?? null;
    const usuarioId = await upsertUsuario(client, payload.usuarioEmail, payload.usuarioNombre) ?? existing.data?.usuario_id ?? null;
    const row = {
      unidad_clues: normalizedClues,
      numero: payload.numeroConsultorio,
      usuario_id: usuarioId,
      fecha_registro: timestamp,
      turno: enabled === false ? null : existing.data?.turno || null,
      turno_consultorio: enabled === false ? null : existing.data?.turno_consultorio || payload.turno || null,
      habilitado: enabled,
      causas_inhabilitacion: enabled === true ? '' : [...selectedCauses].join(', '),
      medicos_generales: enabled === false
        ? null
        : payload.pregunta === GENERAL_DOCTOR_COUNT_QUESTION ? payload.valor : existing.data?.medicos_generales ?? null
    };
    const result = existing.data
      ? await client.from('consultorios').update(row).eq('id', existing.data.id)
      : await client.from('consultorios').insert(row);
    if (result.error) throw result.error;
    if (payload.pregunta === OFFICE_ENABLED_QUESTION && !enabled) {
      const { error } = await client.rpc('eliminar_datos_consultorio_deshabilitado', {
        p_clues: normalizedClues,
        p_consultorio: payload.numeroConsultorio
      });
      if (error) throw error;
    }
    return timestamp;
  }

  const questionId = getEquipmentId(payload.pregunta.trim());
  if (!questionId) throw new Error(`La pregunta no existe en el catálogo: ${payload.pregunta}`);
  const timestamp = new Date().toISOString();
  const { error } = await client.rpc('guardar_respuesta_consultorio', {
    p_clues: normalizedClues,
    p_consultorio: payload.numeroConsultorio,
    p_pregunta_id: questionId,
    p_valor: payload.valor,
    p_usuario_email: payload.usuarioEmail,
    p_usuario_nombre: payload.usuarioNombre
  });
  if (error) throw error;
  return timestamp;
}

export interface ApiResponse<T = any> {
  success: boolean;
  message?: string;
  data?: T;
  error?: string;
  serverTimestamp?: string;
  version?: number;
}

export interface AdminResponseRow {
  id: number;
  fecha_registro: string;
  tipo_registro: 'unidad' | 'consultorio';
  entidad: string | null;
  usuario_nombre: string | null;
  usuario_email: string | null;
  clues_imb: string;
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

async function adminPassword(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function readApiResponse(response: Response) {
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    throw new Error('El servidor administrativo no está disponible en este sitio. Configure la URL del backend.');
  }
  return response.json();
}

async function fetchAdminApi(input: string, init?: RequestInit) {
  try {
    return await fetch(input, init);
  } catch {
    throw new Error('La API administrativa aún no está desplegada o no se puede conectar.');
  }
}

export async function authenticateAdmin(username: string, password: string): Promise<string> {
  if (!adminAuth) throw new Error('El servicio de acceso no está configurado');
  const normalizedUsername = username.trim().toLowerCase();
  const { data, error } = await adminAuth.auth.signInWithPassword({
    email: `${normalizedUsername}@admin.example.com`,
    password: await adminPassword(password)
  });
  if (error || !data.session?.access_token) {
    throw new Error('Usuario o contraseña incorrectos');
  }
  return data.session.access_token;
}

export async function logoutAdmin(token: string): Promise<void> {
  if (!token || !adminAuth) return;
  await adminAuth.auth.signOut({ scope: 'local' });
}

export async function fetchAdminResponses(token: string): Promise<AdminResponseRow[]> {
  const response = await fetchAdminApi(`${API_BASE}/admin/respuestas/`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const json = await readApiResponse(response);
  if (!response.ok || !json.success) {
    throw new Error(json.message || 'No fue posible consultar la base de datos');
  }
  return json.data || [];
}

export async function checkServerHealth(): Promise<boolean> {
  if (supabase) {
    const { error } = await supabase.from('unidades').select('clues_imb').limit(1);
    return !error;
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(`${API_BASE}/health`, { credentials: 'omit', signal: controller.signal });
    clearTimeout(timeoutId);
    return res.ok;
  } catch (err) {
    return false;
  }
}

export async function fetchEntities(): Promise<MexicanEntity[]> {
  if (supabase) {
    const { MEXICAN_ENTITIES } = await import('../data/mexicoEntities.ts');
    return MEXICAN_ENTITIES;
  }

  try {
    const res = await fetch(`${API_BASE}/entidades/`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    return json.data || json;
  } catch (err) {
    console.warn('API entities fetch error, using local catalog:', err);
    const { MEXICAN_ENTITIES } = await import('../data/mexicoEntities.ts');
    return MEXICAN_ENTITIES;
  }
}

export async function fetchUnitsByEntity(entityName: string): Promise<MedicalUnit[]> {
  if (supabase) {
    const { getUnitsForEntity } = await import('../data/mexicoEntities.ts');
    return getUnitsForEntity(entityName);
  }

  try {
    const res = await fetch(`${API_BASE}/unidades/?entidad=${encodeURIComponent(entityName)}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    return json.data || json;
  } catch (err) {
    console.warn('API units fetch error, using local generator:', err);
    const { getUnitsForEntity } = await import('../data/mexicoEntities.ts');
    return getUnitsForEntity(entityName);
  }
}

export async function searchUnits(query: string, entityName?: string): Promise<MedicalUnit[]> {
  if (supabase) {
    const { INITIAL_MEDICAL_UNITS, getUnitsForEntity } = await import('../data/mexicoEntities.ts');
    const all = entityName ? getUnitsForEntity(entityName) : INITIAL_MEDICAL_UNITS;
    const normalizedQuery = query.trim().toLowerCase();
    return all.filter((unit) =>
      unit.clues.toLowerCase().includes(normalizedQuery) ||
      unit.name.toLowerCase().includes(normalizedQuery) ||
      unit.municipality?.toLowerCase().includes(normalizedQuery)
    );
  }

  try {
    const params = new URLSearchParams();
    params.set('q', query);
    if (entityName) params.set('entidad', entityName);
    const res = await fetch(`${API_BASE}/unidades/buscar/?${params.toString()}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    return json.data || json;
  } catch (err) {
    console.warn('API search error, fallback fuzzy search:', err);
    const { INITIAL_MEDICAL_UNITS, getUnitsForEntity } = await import('../data/mexicoEntities.ts');
    const all = entityName ? getUnitsForEntity(entityName) : INITIAL_MEDICAL_UNITS;
    const q = query.trim().toLowerCase();
    return all.filter(
      (u) =>
        u.clues.toLowerCase().includes(q) ||
        u.name.toLowerCase().includes(q) ||
        u.municipality?.toLowerCase().includes(q)
    );
  }
}

export async function fetchUnitResponses(clues: string): Promise<{ answers: Record<string, QuestionAnswer>; general?: UnitGeneralData }> {
  const questionAliases: Record<string, string> = {
    'Cubeta de acero inoxidable / Porta cubeta rodable con protector de hule': 'Cubeta de acero inoxidable con porta cubeta rodable con protector de hule',
    'Refrigerador para conservación y manejo de biológicos': 'Refrigerador para vacunas',
    'Congelador para conservación y manejo de biológicos': 'Congelador para paquetes fríos'
  };
  const normalizeQuestionName = (question: string) => questionAliases[question] || question;

  if (supabase) {
    const normalizedClues = clues.trim().toUpperCase();
    const unidadResult = await supabase.from('unidades').select('*').eq('clues_imb', normalizedClues).maybeSingle();
    if (unidadResult.error) throw unidadResult.error;
    const consultoriosResult = await supabase
      .from('consultorios')
      .select('*, usuarios(email, nombre)')
      .eq('unidad_clues', normalizedClues);
    if (consultoriosResult.error) throw consultoriosResult.error;

    const config = unidadResult.data;
    const offices = consultoriosResult.data || [];
    const officeIds = offices.map((office) => office.id);
    let equipmentResult: { data: { consultorio_id: number; pregunta_id: number; cantidad: number }[] | null; error: any } = { data: [], error: null };
    if (officeIds.length > 0) {
      equipmentResult = await supabase.from('respuestas_equipamiento').select('*').in('consultorio_id', officeIds);
      if (equipmentResult.error) throw equipmentResult.error;
    }
    const equipmentByOffice = new Map<number, Map<number, number>>();
    (equipmentResult.data || []).forEach((row) => {
      if (!equipmentByOffice.has(row.consultorio_id)) equipmentByOffice.set(row.consultorio_id, new Map());
      equipmentByOffice.get(row.consultorio_id)!.set(Number(row.pregunta_id), Number(row.cantidad));
    });

    const answers: Record<string, QuestionAnswer> = {};
    const turns: UnitGeneralData['turns'] = {};

    offices.forEach((office) => {
      const officeNumber = Number(office.numero);
      const updatedAt = office.fecha_registro || new Date().toISOString();
      if (office.habilitado !== null) {
        answers[`${officeNumber}__${OFFICE_ENABLED_QUESTION}`] = {
          clues: normalizedClues,
          officeNumber,
          question: OFFICE_ENABLED_QUESTION,
          value: office.habilitado ? 1 : 0,
          status: 'saved_cloud',
          turn: office.turno_consultorio || '',
          updatedAt
        };
      }
      if (office.turno_consultorio) turns[officeNumber] = office.turno_consultorio;
      if (office.medicos_generales !== null) {
        answers[`${officeNumber}__${GENERAL_DOCTOR_COUNT_QUESTION}`] = {
          clues: normalizedClues,
          officeNumber,
          question: GENERAL_DOCTOR_COUNT_QUESTION,
          value: Number(office.medicos_generales),
          status: 'saved_cloud',
          turn: office.turno_consultorio || '',
          updatedAt
        };
      }
      const selectedCauses = new Set<string>(parseStoredCauses(office.causas_inhabilitacion));
      DISABLED_OFFICE_CAUSES.forEach((cause) => {
        if (!selectedCauses.has(cause.label)) return;
        answers[`${officeNumber}__${cause.question}`] = {
          clues: normalizedClues,
          officeNumber,
          question: cause.question,
          value: 1,
          status: 'saved_cloud',
          turn: office.turno_consultorio || '',
          updatedAt
        };
      });
      if (selectedCauses.size > 0) {
        answers[`${officeNumber}__${DISABLED_CAUSE_CONFIRMATION_QUESTION}`] = {
          clues: normalizedClues,
          officeNumber,
          question: DISABLED_CAUSE_CONFIRMATION_QUESTION,
          value: 1,
          status: 'saved_cloud',
          turn: office.turno_consultorio || '',
          updatedAt
        };
      }
    });

    offices.forEach((office) => {
      const officeNumber = Number(office.numero);
      const updatedAt = office.fecha_registro || new Date().toISOString();
      const storedSchedule = parseStoredSchedule(office.turno);
      (['Matutino', 'Vespertino'] as OperationalTurn[]).forEach((operationalTurn) => {
        WEEK_DAYS.forEach(({ key: day }) => {
        const scheduleKey = `${operationalTurn.toLowerCase()}-${day}`;
        if (!storedSchedule.has(scheduleKey)) return;
        const scheduleQuestion = getOfficeScheduleQuestion(operationalTurn, day);
        const doctorQuestion = getDoctorAvailabilityQuestion(operationalTurn, day);
        answers[`${officeNumber}__${scheduleQuestion}`] = {
          clues: normalizedClues, officeNumber, question: scheduleQuestion, value: 1,
          status: 'saved_cloud', turn: operationalTurn, updatedAt
        };
        answers[`${officeNumber}__${doctorQuestion}`] = {
          clues: normalizedClues, officeNumber, question: doctorQuestion,
          value: storedSchedule.get(scheduleKey) ? 1 : 0,
          status: 'saved_cloud', turn: operationalTurn, updatedAt
        };
        });
      });
      const officeEquipment = equipmentByOffice.get(office.id);
      EQUIPMENT_CATALOG.forEach((item) => {
        const storedValue = officeEquipment?.get(Number(item.id));
        if (storedValue === undefined) return;
        const question = normalizeQuestionName(item.name);
        answers[`${officeNumber}__${question}`] = {
          clues: normalizedClues,
          officeNumber,
          question,
          value: Number(storedValue),
          status: 'saved_cloud',
          turn: '',
          updatedAt,
          version: Number(office.catalogo_version || 1)
        };
      });
    });

    const latestOffice = [...offices].sort(
      (a, b) => new Date(b.fecha_registro).getTime() - new Date(a.fecha_registro).getTime()
    )[0];
    const latestUsuario = latestOffice?.usuarios as { email?: string; nombre?: string } | null | undefined;

    const general = config ? {
      clues: normalizedClues,
      entidad: config.entidad || '',
      nombreUnidad: config.nombre_de_la_unidad || '',
      usuarioNombre: latestUsuario?.nombre || '',
      usuarioEmail: latestUsuario?.email || '',
      hasInternet: config.internet || 'PENDIENTE',
      configuredOffices: config.consultorios == null ? null : Number(config.consultorios),
      turns,
      updatedAt: config.fecha_registro || new Date().toISOString()
    } satisfies UnitGeneralData : undefined;

    return { answers, general };
  }

  try {
    const res = await fetch(`${API_BASE}/unidades/${encodeURIComponent(clues)}/respuestas/`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    const answers: Record<string, QuestionAnswer> = {};
    if (json.data?.matriz && Object.keys(json.data.matriz).length > 0) {
      Object.entries(json.data.matriz).forEach(([officeNumber, questions]) => {
        Object.entries(questions as Record<string, any>).forEach(([storedQuestion, cell]) => {
          const numericOffice = Number(officeNumber);
          const question = normalizeQuestionName(storedQuestion);
          answers[`${numericOffice}__${question}`] = {
            clues,
            officeNumber: numericOffice,
            question,
            value: cell.valor,
            status: 'saved_cloud',
            turn: cell.turno,
            updatedAt: cell.fechaRegistro || new Date().toISOString()
          };
        });
      });
    } else if (json.data && Array.isArray(json.data.respuestas)) {
      json.data.respuestas.forEach((r: any) => {
        const question = normalizeQuestionName(r.pregunta || r.question);
        const k = `${r.numeroConsultorio || r.officeNumber}__${question}`;
        answers[k] = {
          clues: r.clues,
          officeNumber: r.numeroConsultorio || r.officeNumber,
          question,
          value: r.valor !== undefined ? r.valor : r.value,
          status: 'saved_cloud',
          turn: r.turno || r.turn,
          updatedAt: r.fechaActualizacion || r.updatedAt || new Date().toISOString(),
          version: r.version || 1
        };
      });
    }
    return {
      answers,
      general: json.data?.general
    };
  } catch (err) {
    console.warn('API unit responses error:', err);
    return { answers: {} };
  }
}

export async function saveSingleAnswer(payload: {
  entidad: string;
  usuarioNombre: string;
  usuarioEmail: string;
  clues: string;
  nombreUnidad: string;
  categoria: string;
  numeroConsultorios: number;
  numeroConsultorio: number;
  pregunta: string;
  valor: number;
  turno?: string;
  tipoRegistro?: string;
  version?: number;
}): Promise<ApiResponse> {
  if (supabase) {
    const serverTimestamp = await saveAnswerRow(payload);
    return { success: true, message: 'Respuesta guardada correctamente', serverTimestamp };
  }

  const res = await fetch(`${API_BASE}/respuestas/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...payload,
      fechaActualizacion: new Date().toISOString()
    })
  });

  const json = await res.json();
  if (!res.ok && !json.success) {
    throw new Error(json.message || 'No fue posible guardar la respuesta');
  }
  return json;
}

export async function saveUnitGeneral(clues: string, generalData: UnitGeneralData): Promise<ApiResponse> {
  if (supabase) {
    const client = requireSupabase();
    const normalizedClues = clues.trim().toUpperCase();
    const timestamp = new Date().toISOString();
    const usuarioId = await upsertUsuario(client, generalData.usuarioEmail, generalData.usuarioNombre);
    const unidadRow = {
      clues_imb: normalizedClues,
      usuario_id: usuarioId,
      entidad: generalData.entidad || '',
      nombre_de_la_unidad: generalData.nombreUnidad || '',
      internet: generalData.hasInternet,
      consultorios: generalData.configuredOffices,
      fecha_registro: timestamp
    };
    const unidadResult = await client.from('unidades').upsert(unidadRow, { onConflict: 'clues_imb' });
    if (unidadResult.error) throw unidadResult.error;

    for (const [officeNumber, turn] of Object.entries(generalData.turns)) {
      if (!turn) continue;
      const numericOffice = Number(officeNumber);
      const existingOffice = await client.from('consultorios').select('*')
        .eq('unidad_clues', normalizedClues)
        .eq('numero', numericOffice)
        .maybeSingle();
      if (existingOffice.error) throw existingOffice.error;
      const officeRow = {
        unidad_clues: normalizedClues,
        numero: numericOffice,
        usuario_id: usuarioId ?? existingOffice.data?.usuario_id ?? null,
        fecha_registro: timestamp,
        turno: existingOffice.data?.turno || null,
        turno_consultorio: turn,
        habilitado: existingOffice.data?.habilitado ?? null,
        causas_inhabilitacion: typeof existingOffice.data?.causas_inhabilitacion === 'string'
          ? existingOffice.data.causas_inhabilitacion
          : parseStoredCauses(existingOffice.data?.causas_inhabilitacion).join(', '),
        medicos_generales: existingOffice.data?.medicos_generales ?? null
      };
      const turnResult = existingOffice.data
        ? await client.from('consultorios').update(officeRow).eq('id', existingOffice.data.id)
        : await client.from('consultorios').insert(officeRow);
      if (turnResult.error) throw turnResult.error;

    }

    return { success: true, message: 'Configuración general guardada', data: generalData, serverTimestamp: timestamp };
  }

  const res = await fetch(`${API_BASE}/unidades/${encodeURIComponent(clues)}/configuracion/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(generalData)
  });
  const json = await res.json();
  if (!res.ok || !json.success) {
    throw new Error(json.message || 'No fue posible guardar la configuración de la unidad');
  }
  return json;
}

export async function deleteUnitAnswers(clues: string): Promise<ApiResponse<{ deletedCount: number }>> {
  if (supabase) {
    const { data, error } = await supabase.rpc('eliminar_respuestas_unidad', { p_clues: clues.trim().toUpperCase() });
    if (error) throw error;
    return { success: true, data: { deletedCount: Number(data) || 0 } };
  }

  const res = await fetch(`${API_BASE}/unidades/${encodeURIComponent(clues)}/respuestas/`, {
    method: 'DELETE'
  });
  const json = await res.json();
  if (!res.ok || !json.success) {
    throw new Error(json.message || 'No fue posible eliminar las respuestas de la unidad');
  }
  return json;
}

export async function deleteOfficeTurnSchedules(
  clues: string,
  officeNumber: number,
  turn: OperationalTurn
): Promise<ApiResponse<{ deletedCount: number }>> {
  if (supabase) {
    const { data, error } = await supabase.rpc('eliminar_horarios_turno', {
      p_clues: clues.trim().toUpperCase(),
      p_consultorio: officeNumber,
      p_turno: turn
    });
    if (error) throw error;
    return { success: true, data: { deletedCount: Number(data) || 0 } };
  }

  const res = await fetch(
    `${API_BASE}/unidades/${encodeURIComponent(clues)}/consultorios/${officeNumber}/horarios/${encodeURIComponent(turn)}/`,
    { method: 'DELETE' }
  );
  const json = await res.json();
  if (!res.ok || !json.success) throw new Error(json.message || 'No fue posible borrar los horarios del turno');
  return json;
}

export async function syncBatchQueue(items: SyncQueueItem[]): Promise<ApiResponse<{ syncedIds: string[] }>> {
  if (supabase) {
    const syncedIds: string[] = [];
    for (const item of items) {
      if (item.action === 'save_answer') {
        await saveSingleAnswer(item.payload as Parameters<typeof saveSingleAnswer>[0]);
      } else if (item.action === 'save_general') {
        await saveUnitGeneral(item.clues, item.payload as unknown as UnitGeneralData);
      } else if (item.action === 'delete_turn_schedules') {
        await deleteOfficeTurnSchedules(
          item.clues,
          Number(item.payload.officeNumber),
          item.payload.turn as OperationalTurn
        );
      }
      syncedIds.push(item.id);
    }
    return { success: true, data: { syncedIds } };
  }

  const res = await fetch(`${API_BASE}/sincronizar/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items })
  });
  return res.json();
}

