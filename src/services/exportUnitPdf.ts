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
  officeSections: Array<{
    number: number;
    enabled: boolean;
    turn: string;
    doctors: string;
    causes: string;
    schedules: string;
    equipment: Array<{ name: string; value: number | null | undefined }>;
  }>;
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

  addText(`${data.name} (${data.clues})`, 14, true, [0, 74, 66]);
  addText(`Entidad: ${data.entity} | Internet: ${data.internet} | Consultorios: ${data.offices ?? 'Sin captura'}`);
  addText(`Progreso: ${data.progress}% | Campos capturados: ${data.answered} de ${data.totalQuestions}`);
  addText(`Capturista: ${data.capturista || 'Sin registro'}`);

  for (const office of data.officeSections) {
    ensureSpace(30);
    pdf.setDrawColor(190, 190, 190);
    pdf.line(margin, y, pageWidth - margin, y);
    y += 6;
    addText(`CONSULTORIO ${office.number}`, 11, true, [165, 127, 44]);
    addText(`Habilitado: ${office.enabled ? 'SI' : 'NO'} | Turno: ${office.turn || 'Sin turno'} | Medicos generales: ${office.doctors || 'Sin captura'}`);
    if (!office.enabled) addText(`Causas: ${office.causes || 'Sin captura'}`);
    if (office.enabled) addText(`Horarios: ${office.schedules || 'Sin horarios registrados'}`);

    if (office.enabled && office.equipment.length > 0) {
      addText('Equipamiento capturado:', 9, true);
      for (const item of office.equipment) {
        addText(`- ${item.name}: ${item.value ?? 'Sin captura'}`, 8);
      }
    }
  }

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
