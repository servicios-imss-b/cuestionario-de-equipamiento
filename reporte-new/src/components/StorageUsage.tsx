import { useEffect, useState } from 'react';
import { AlertTriangle, HardDrive, RefreshCw } from 'lucide-react';
import { fetchStorageUsage, type StorageUsageRow } from '../data';

const LIMITE_BYTES_FREE_TIER = 500 * 1024 * 1024;
const UMBRAL_ALERTA_PCT = 80;

const TABLE_LABELS: Record<string, string> = {
  total_base: 'Base completa',
  unidades: 'Unidades',
  usuarios: 'Usuarios',
  consultorios: 'Consultorios',
  respuestas_equipamiento: 'Respuestas de equipamiento',
  respuestas: 'Respuestas (legado)',
};

function barColor(pct: number): string {
  if (pct >= UMBRAL_ALERTA_PCT) return 'bg-imss-wine';
  if (pct >= 60) return 'bg-amber-500';
  return 'bg-imss-green';
}

export function StorageUsage() {
  const [rows, setRows] = useState<StorageUsageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      setLoading(true);
      setError(null);
      const data = await fetchStorageUsage();
      setRows(data);

      const total = data.find((row) => row.tabla === 'total_base');
      if (total) {
        const pct = (total.bytes / LIMITE_BYTES_FREE_TIER) * 100;
        if (pct >= UMBRAL_ALERTA_PCT) {
          console.warn(`[Almacenamiento] Uso al ${pct.toFixed(1)}% del límite de 500 MB (${total.tamanoLegible}).`);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ocurrió un error al consultar el almacenamiento');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const total = rows.find((row) => row.tabla === 'total_base');
  const totalPct = total ? Math.min(100, (total.bytes / LIMITE_BYTES_FREE_TIER) * 100) : 0;
  const tablas = rows.filter((row) => row.tabla !== 'total_base');

  return (
    <div className="card space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <HardDrive className="h-5 w-5 text-imss-green" />
          <h3 className="text-lg font-bold text-gray-800">Uso de almacenamiento (Supabase)</h3>
        </div>
        <button
          onClick={() => load()}
          disabled={loading}
          className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Actualizar
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-imss-wine/30 bg-imss-wine/5 p-3 text-sm text-imss-wine">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {loading && !rows.length ? (
        <p className="text-sm text-gray-500">Consultando tamaño de la base de datos...</p>
      ) : total ? (
        <div className="space-y-2">
          <div className="flex items-baseline justify-between text-sm">
            <span className="font-semibold text-gray-700">Total de la base de datos</span>
            <span className="text-gray-500">{total.tamanoLegible} de 500 MB ({totalPct.toFixed(1)}%)</span>
          </div>
          <div className="h-3 w-full overflow-hidden rounded-full bg-gray-100">
            <div
              className={`h-full rounded-full transition-all ${barColor(totalPct)}`}
              style={{ width: `${totalPct}%` }}
            />
          </div>
          {totalPct >= UMBRAL_ALERTA_PCT && (
            <p className="flex items-center gap-2 text-sm font-semibold text-imss-wine">
              <AlertTriangle className="h-4 w-4" />
              Uso por encima del {UMBRAL_ALERTA_PCT}% del límite gratuito. Considera limpiar datos o subir de plan.
            </p>
          )}
        </div>
      ) : null}

      {tablas.length > 0 && (
        <div className="space-y-3">
          <p className="text-sm font-semibold text-gray-700">Detalle por tabla</p>
          {tablas.map((row) => {
            const pct = total ? Math.min(100, (row.bytes / total.bytes) * 100) : 0;
            return (
              <div key={row.tabla} className="space-y-1">
                <div className="flex items-baseline justify-between text-xs">
                  <span className="font-medium text-gray-600">{TABLE_LABELS[row.tabla] ?? row.tabla}</span>
                  <span className="text-gray-400">{row.tamanoLegible}</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100">
                  <div className="h-full rounded-full bg-gray-400" style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
