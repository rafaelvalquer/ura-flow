import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

export async function exportFlowToPdf(element, { stateName, viewMode }) {
  if (!element) throw new Error('Área do fluxo não encontrada para exportação.');

  const canvas = await html2canvas(element, {
    backgroundColor: '#F8FAFC',
    scale: 2,
    useCORS: true,
  });

  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 10;
  const headerHeight = 20;
  const imageWidth = pageWidth - margin * 2;
  const imageHeight = Math.min(
    pageHeight - margin * 2 - headerHeight,
    (canvas.height * imageWidth) / canvas.width,
  );

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(14);
  pdf.text(`URA Flow Builder - ${stateName || 'Estado'}`, margin, 12);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9);
  pdf.text(`Visão: ${viewMode === 'detailedView' ? 'Visão detalhada' : 'Visão por estado'}`, margin, 18);
  pdf.text(`Exportado em: ${new Date().toLocaleString('pt-BR')}`, margin + 72, 18);

  pdf.addImage(canvas.toDataURL('image/png'), 'PNG', margin, margin + headerHeight, imageWidth, imageHeight);
  pdf.save(`ura-flow-${sanitizeFileName(stateName || 'estado')}.pdf`);
}

function sanitizeFileName(value) {
  return String(value).replace(/[^a-z0-9_-]+/gi, '-').replace(/^-+|-+$/g, '');
}
