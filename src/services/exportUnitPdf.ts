import { jsPDF } from 'jspdf';

interface UnitPdfData {
  clues: string;
  entity: string;
  name: string;
  internet: string;
  offices: number | null;
  progress: number;
  answered: number;
  totalQuestions: number;
  capturista: string;
}

export function exportUnitPdf(data: UnitPdfData): void {
  const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
  const margin = 16;
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  let y = margin;

  const ensureSpace = (height: number) => {
    if (y + height > pageHeight - margin) {
      pdf.addPage();
      y = margin;
    }
  };

  const addText = (text: string, size = 9, bold = false, color: [number, number, number] = [45, 45, 45]) => {
    pdf.setFont('helvetica', bold ? 'bold' : 'normal');
    pdf.setFontSize(size);
    pdf.setTextColor(...color);
    const lines = pdf.splitTextToSize(String(text || '-'), pageWidth - margin * 2);
    ensureSpace(lines.length * 4.5 + 2);
    pdf.text(lines, margin, y);
    y += lines.length * 4.5 + 2;
  };

  pdf.setFillColor(0, 74, 66);
  pdf.rect(0, 0, pageWidth, 28, 'F');
  pdf.setTextColor(255, 255, 255);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(16);
  pdf.text('EXPEDIENTE DE UNIDAD MEDICA', margin, 13);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9);
  pdf.text('IMSS-BIENESTAR | Censo de equipamiento', margin, 21);
  y = 38;

  addText('Detalles de la Unidad', 14, true, [0, 74, 66]);
  addText('Captura al 100% lista para guardarse', 10, true, [0, 120, 90]);
  addText(`CLUES: ${data.clues}`);
  addText(`Entidad Federativa: ${data.entity}`);
  addText(`Nombre de Unidad: ${data.name}`);
  addText(`Servicio de Internet: ${data.internet}`);
  addText(`Consultorios Configurados: ${data.offices ?? 'Sin captura'}`);
  addText(`Progreso de Captura: ${data.progress}% completado`);
  addText(`Campos Capturados: ${data.answered} de ${data.totalQuestions}`);
  addText(`Capturista Registrado: ${data.capturista || 'Sin registro'}`);

  const pages = pdf.getNumberOfPages();
  for (let page = 1; page <= pages; page += 1) {
    pdf.setPage(page);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8);
    pdf.setTextColor(120, 120, 120);
    pdf.text(`Pagina ${page} de ${pages}`, pageWidth - margin, pageHeight - 8, { align: 'right' });
  }

  const safeClues = data.clues.replace(/[^a-z0-9_-]/gi, '_');
  pdf.save(`expediente_${safeClues}.pdf`);
}
