import { useMemo, useState, type ReactNode } from 'react';
import { Download, FileArchive, Search, ArrowUpDown, ChevronUp, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { exportarExcel } from '../exportExcel';
import { exportarParquet } from '../exportParquet';

interface Column<T> {
  key: keyof T;
  label: string;
  render?: (row: T) => ReactNode;
  sortable?: boolean;
}

interface DataTableProps<T extends object> {
  data: T[];
  columns: Column<T>[];
  exportColumns?: Column<T>[];
  exportFileName: string;
  exportSheetName: string;
  description?: string;
  showExports?: boolean;
}

const PAGE_SIZE = 15;

export function DataTable<T extends object>({
  data,
  columns,
  exportColumns,
  exportFileName,
  exportSheetName,
  description,
  showExports = false,
}: DataTableProps<T>) {
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<keyof T | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [page, setPage] = useState(0);
  const [percentageRange, setPercentageRange] = useState('all');
  const percentageColumn = columns.find((column) => /porcentaje|percent|pct/i.test(String(column.key)));

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return data.filter((row) => {
      const matchesSearch = !search.trim()
        || columns.some((col) => String(row[col.key] ?? '').toLowerCase().includes(q));
      if (!matchesSearch || !percentageColumn || percentageRange === 'all') return matchesSearch;

      const percentage = Number(row[percentageColumn.key]);
      if (!Number.isFinite(percentage)) return false;
      if (percentageRange === 'under-10') return percentage < 10;
      if (percentageRange === '100') return percentage >= 100;
      if (percentageRange.startsWith('from-')) {
        return percentage >= Number(percentageRange.replace('from-', ''));
      }
      return true;
    });
  }, [data, search, columns, percentageColumn, percentageRange]);

  const sorted = useMemo(() => {
    if (!sortKey) return filtered;
    return [...filtered].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];

      if (typeof av === 'number' && typeof bv === 'number') {
        return sortDir === 'asc' ? av - bv : bv - av;
      }

      return sortDir === 'asc'
        ? String(av).localeCompare(String(bv), 'es')
        : String(bv).localeCompare(String(av), 'es');
    });
  }, [filtered, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const cur = Math.min(page, totalPages - 1);
  const paginated = sorted.slice(cur * PAGE_SIZE, (cur + 1) * PAGE_SIZE);

  const handleSort = (key: keyof T) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const handleExport = () => {
    const columnsToExport = exportColumns ?? columns;
    const out = sorted.map((row) => Object.fromEntries(
      columnsToExport.map((column) => [column.label, row[column.key]]),
    ));
    exportarExcel(out, exportFileName, exportSheetName);
  };

  const handleParquetExport = () => {
    const columnsToExport = exportColumns ?? columns;
    const out = sorted.map((row) => Object.fromEntries(
      columnsToExport.map((column) => [column.label, row[column.key]]),
    ));
    exportarParquet(out, exportFileName);
  };

  return (
    <div className="card animate-fade-in overflow-hidden">
      {description && (
        <div className="border-b border-gray-100 bg-emerald-50/60 px-4 py-3 text-sm text-gray-600">
          {description}
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 bg-white px-4 py-3">
        <label className="relative block w-full max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
            placeholder="Buscar en la tabla..."
            className="w-full rounded-lg border border-gray-200 bg-gray-50 py-2 pl-9 pr-3 text-sm outline-none transition focus:border-imss-green/40 focus:bg-white"
          />
        </label>
        {percentageColumn && (
          <select
            value={percentageRange}
            onChange={(event) => {
              setPercentageRange(event.target.value);
              setPage(0);
            }}
            className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm font-semibold text-gray-700 outline-none transition focus:border-imss-green/40 focus:bg-white"
            aria-label="Filtrar tabla por porcentaje"
          >
            <option value="all">Todos los porcentajes</option>
            <option value="under-10">Menor a 10%</option>
            {[10, 20, 30, 40, 50, 60, 70, 80, 90].map((lowerBound) => (
              <option key={lowerBound} value={`from-${lowerBound}`}>{lowerBound}% a 100%</option>
            ))}
            <option value="100">Sólo 100%</option>
          </select>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50/80">
              {columns.map((col) => (
                <th key={String(col.key)} className="whitespace-nowrap px-4 py-3 text-left font-semibold">
                  {col.sortable !== false ? (
                    <button
                      onClick={() => handleSort(col.key)}
                      className="flex items-center gap-1 text-xs uppercase tracking-wider text-gray-500 transition-colors hover:text-imss-green"
                    >
                      {col.label}
                      {sortKey === col.key ? (
                        sortDir === 'asc'
                          ? <ChevronUp className="h-3.5 w-3.5 text-imss-gold" />
                          : <ChevronDown className="h-3.5 w-3.5 text-imss-gold" />
                      ) : (
                        <ArrowUpDown className="h-3 w-3 opacity-30" />
                      )}
                    </button>
                  ) : (
                    <span className="text-xs uppercase tracking-wider text-gray-500">{col.label}</span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paginated.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-16 text-center text-sm text-gray-400">
                  No se encontraron registros
                </td>
              </tr>
            ) : (
              paginated.map((row, i) => (
                <tr key={i} className="border-b border-gray-50 transition-colors hover:bg-gray-50/70">
                  {columns.map((col) => (
                    <td key={String(col.key)} className="whitespace-nowrap px-4 py-3 text-gray-700">
                      {col.render ? col.render(row) : String(row[col.key] ?? '')}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between border-t border-gray-100 bg-gray-50/60 px-4 py-3 text-sm">
        <p className="text-xs text-gray-400">
          {sorted.length > 0 ? cur * PAGE_SIZE + 1 : 0}-{Math.min((cur + 1) * PAGE_SIZE, sorted.length)} de {sorted.length} registros
        </p>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setPage(Math.max(0, cur - 1))}
            disabled={cur === 0}
            className="rounded-lg border border-gray-200 p-1.5 text-gray-500 transition-colors hover:bg-white disabled:cursor-not-allowed disabled:opacity-30"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="text-xs tabular-nums text-gray-500">
            {cur + 1} / {totalPages}
          </span>
          <button
            onClick={() => setPage(Math.min(totalPages - 1, cur + 1))}
            disabled={cur >= totalPages - 1}
            className="rounded-lg border border-gray-200 p-1.5 text-gray-500 transition-colors hover:bg-white disabled:cursor-not-allowed disabled:opacity-30"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        {showExports && (
          <div className="flex items-center gap-2">
            <button
              onClick={handleExport}
              className="flex items-center gap-2 rounded-lg bg-imss-green px-4 py-2 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-imss-green-mid"
            >
              <Download className="h-3.5 w-3.5" />
              Exportar Excel
            </button>
            <button
              onClick={handleParquetExport}
              className="flex items-center gap-2 rounded-lg border border-imss-green px-4 py-2 text-xs font-semibold text-imss-green shadow-sm transition-colors hover:bg-imss-green/10"
            >
              <FileArchive className="h-3.5 w-3.5" />
              Exportar Parquet
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
