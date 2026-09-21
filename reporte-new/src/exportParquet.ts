import { parquetWriteBuffer } from 'hyparquet-writer';

function parquetColumnType(values: unknown[]): 'BOOLEAN' | 'INT32' | 'DOUBLE' | 'STRING' {
  const nonNull = values.filter((value) => value !== null && value !== undefined && value !== '');
  if (nonNull.length > 0 && nonNull.every((value) => typeof value === 'boolean')) return 'BOOLEAN';
  if (nonNull.length > 0 && nonNull.every((value) => typeof value === 'number' && Number.isInteger(value))) return 'INT32';
  if (nonNull.length > 0 && nonNull.every((value) => typeof value === 'number')) return 'DOUBLE';
  return 'STRING';
}

export function exportarParquet(
  datos: Record<string, unknown>[],
  nombreArchivo: string,
): void {
  const columnNames = [...new Set(datos.flatMap((row) => Object.keys(row)))];
  const columnData = columnNames.map((name) => {
    const values = datos.map((row) => row[name] ?? null);
    const type = parquetColumnType(values);
    return {
      name,
      data: values.map((value) => value === undefined ? null : value),
      type,
    };
  });

  const buffer = parquetWriteBuffer({ columnData });
  const blob = new Blob([buffer], { type: 'application/vnd.apache.parquet' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${nombreArchivo}_${new Date().toISOString().slice(0, 10)}.parquet`;
  anchor.click();
  URL.revokeObjectURL(url);
}
