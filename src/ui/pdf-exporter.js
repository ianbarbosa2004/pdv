import jsPDF from "jspdf";

const A4_WIDTH_MM = 210;
const A4_HEIGHT_MM = 297;
const PDF_MARGIN_MM = 16;

const splitPdfText = (pdf, text, maxWidth) =>
  pdf.splitTextToSize(String(text ?? ""), maxWidth);

const drawWrappedText = (pdf, text, x, y, maxWidth, lineHeight = 5) => {
  const lines = splitPdfText(pdf, text, maxWidth);
  pdf.text(lines, x, y);
  return y + (lines.length * lineHeight);
};

export const savePageAsPdf = async ({
  element,
  fileName = "documento.pdf",
  scale = 2
}) => {
  if (!element) throw new Error("Elemento do documento não informado.");
  const pdf = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4"
  });

  const contentWidth = A4_WIDTH_MM - (PDF_MARGIN_MM * 2);
  const logoSize = 24.34;
  const headerTop = 18;
  const metaX = PDF_MARGIN_MM + logoSize + 4;
  const metaWidth = contentWidth - logoSize - 4;

  pdf.setFillColor(237, 244, 246);
  pdf.rect(metaX, headerTop, metaWidth, logoSize, "F");
  pdf.setDrawColor(8, 121, 154);
  pdf.setLineWidth(1);
  pdf.line(metaX, headerTop, metaX, headerTop + logoSize);

  const logo = element.querySelector(".print-preview-company-logo");
  if (logo?.src && !logo.src.startsWith("http")) {
    try {
      const format = logo.src.startsWith("data:image/jpeg") ? "JPEG" : "PNG";
      const properties = pdf.getImageProperties(logo.src);
      const aspectRatio = properties.width / properties.height;
      const renderedWidth = aspectRatio >= 1 ? logoSize : logoSize * aspectRatio;
      const renderedHeight = aspectRatio >= 1 ? logoSize / aspectRatio : logoSize;
      const logoX = PDF_MARGIN_MM + ((logoSize - renderedWidth) / 2);
      const logoY = headerTop + ((logoSize - renderedHeight) / 2);
      pdf.addImage(
        logo.src,
        format,
        logoX,
        logoY,
        renderedWidth,
        renderedHeight
      );
    } catch {
      // PDF generation remains usable when the optional logo cannot be decoded.
    }
  }

  pdf.setTextColor(23, 32, 51);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(16);
  pdf.text(
    String(element.querySelector(".print-preview-document-meta strong")?.textContent || "Ficha Técnica"),
    metaX + 4,
    headerTop + 8
  );

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(10);
  const fields = Array.from(element.querySelectorAll(".print-preview-document-meta span"));
  pdf.setFont("helvetica", "bold");
  fields.forEach((field, index) => {
    pdf.text(field.textContent || "", metaX + 4, headerTop + 14 + (index * 5));
  });

  pdf.setDrawColor(8, 121, 154);
  pdf.setLineWidth(0.8);
  pdf.line(PDF_MARGIN_MM, headerTop + logoSize + 4, A4_WIDTH_MM - PDF_MARGIN_MM, headerTop + logoSize + 4);

  let cursorY = headerTop + logoSize + 12;
  const sectionTitle = element.querySelector(".print-preview-section h2");
  if (sectionTitle) {
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(11);
    pdf.text(sectionTitle.textContent || "", PDF_MARGIN_MM, cursorY);
    cursorY += 5;
  }

  const table = element.querySelector(".print-preview-table");
  if (table) {
    const headers = Array.from(table.querySelectorAll("thead th")).map((cell) => cell.textContent?.trim() || "");
    const rows = Array.from(table.querySelectorAll("tbody tr")).map((row) =>
      Array.from(row.querySelectorAll("td")).map((cell) => cell.textContent?.trim() || "")
    );
    const widths = headers.length === 5
      ? [12, 68, 34, 32, 32]
      : headers.map(() => contentWidth / Math.max(headers.length, 1));

    const headerHeight = 9;
    let x = PDF_MARGIN_MM;
    headers.forEach((header, index) => {
      pdf.setFillColor(237, 243, 246);
      pdf.setDrawColor(203, 213, 223);
      pdf.setLineWidth(0.25);
      pdf.setTextColor(23, 32, 51);
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(8);
      pdf.rect(x, cursorY, widths[index], headerHeight, "F");
      pdf.rect(x, cursorY, widths[index], headerHeight, "S");
      const lines = splitPdfText(pdf, header, widths[index] - 4);
      pdf.text(
        lines,
        x + (widths[index] / 2),
        cursorY + 5.7,
        { align: "center" }
      );
      x += widths[index];
    });
    cursorY += headerHeight;

    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8.5);
    rows.forEach((row) => {
      const rowHeights = row.map((cell, index) =>
        splitPdfText(pdf, cell, widths[index] - 4).length * 3.5 + 4
      );
      const rowHeight = Math.max(8, ...rowHeights);
      if (cursorY + rowHeight > A4_HEIGHT_MM - 20) {
        pdf.addPage();
        cursorY = PDF_MARGIN_MM;
        let repeatX = PDF_MARGIN_MM;
        pdf.setFillColor(237, 243, 246);
        pdf.setDrawColor(203, 213, 223);
        pdf.setTextColor(23, 32, 51);
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(8);
        headers.forEach((header, index) => {
          pdf.rect(repeatX, cursorY, widths[index], headerHeight, "F");
          pdf.rect(repeatX, cursorY, widths[index], headerHeight, "S");
          pdf.text(
            splitPdfText(pdf, header, widths[index] - 4),
            repeatX + (widths[index] / 2),
            cursorY + 5.7,
            { align: "center" }
          );
          repeatX += widths[index];
        });
        cursorY += headerHeight;
        pdf.setFont("helvetica", "normal");
      }

      x = PDF_MARGIN_MM;
      row.forEach((cell, index) => {
        pdf.rect(x, cursorY, widths[index], rowHeight);
        drawWrappedText(pdf, cell, x + 2, cursorY + 5.5, widths[index] - 4, 3.5);
        x += widths[index];
      });
      cursorY += rowHeight;
    });
  }

  const total = element.querySelector(".print-preview-total");
  if (total) {
    cursorY += 8;
    pdf.setDrawColor(203, 213, 223);
    pdf.line(PDF_MARGIN_MM, cursorY - 3, A4_WIDTH_MM - PDF_MARGIN_MM, cursorY - 3);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9);
    pdf.text(total.querySelector("span")?.textContent?.trim() || "Custo total estimado", A4_WIDTH_MM - PDF_MARGIN_MM - 52, cursorY + 2);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(12);
    pdf.text(total.querySelector("strong")?.textContent?.trim() || "", A4_WIDTH_MM - PDF_MARGIN_MM, cursorY + 2, { align: "right" });
  }

  const footer = element.querySelector(".print-preview-document-footer");
  if (footer) {
    pdf.setDrawColor(220, 227, 233);
    pdf.line(PDF_MARGIN_MM, A4_HEIGHT_MM - 18, A4_WIDTH_MM - PDF_MARGIN_MM, A4_HEIGHT_MM - 18);
    pdf.setTextColor(100, 114, 132);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(7);
    pdf.text(footer.textContent?.trim() || "", A4_WIDTH_MM - PDF_MARGIN_MM, A4_HEIGHT_MM - 14, { align: "right" });
  }
  const normalizedFileName = fileName.toLowerCase().endsWith(".pdf") ? fileName : `${fileName}.pdf`;
  const dataUri = pdf.output("datauristring");
  return {
    fileName: normalizedFileName,
    base64: dataUri.slice(dataUri.indexOf(",") + 1),
    blob: pdf.output("blob")
  };
};
