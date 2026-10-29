import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { Relatorio } from "@/lib/types";
import { fmtDate } from "@/lib/format";

// Cache for loaded images
let cachedLogoDataUrl: string | null = null;
let cachedWatermarkDataUrl: string | null = null;

/**
 * Loads an image from URL and returns a Base64 data URL.
 */
async function loadImageDataUrl(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Falha ao carregar imagem: ${url}`);
  }
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Generates a faded transparent version of an image using canvas
 * so it works reliably as a background watermark in any PDF viewer.
 */
async function createFadedWatermark(dataUrl: string, opacity = 0.08): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(dataUrl);
        return;
      }
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.globalAlpha = opacity;
      ctx.drawImage(img, 0, 0);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

/**
 * Ensures assets are loaded once and cached in memory.
 */
async function getAssets() {
  const candidateUrls = [
    "/assets/aistudio/Bras_o_CBM_MT_49c529e2.png",
    "/cbmmt-logo.png",
    "/brasao-cbm-mt.png",
  ];

  if (!cachedLogoDataUrl) {
    for (const url of candidateUrls) {
      try {
        cachedLogoDataUrl = await loadImageDataUrl(url);
        cachedWatermarkDataUrl = await createFadedWatermark(cachedLogoDataUrl, 0.085);
        break;
      } catch {
        // try next candidate
      }
    }
  }

  return {
    logo: cachedLogoDataUrl,
    watermark: cachedWatermarkDataUrl,
  };
}

function fmtIsoDateTimeBr(iso?: string | null): string {
  if (!iso || typeof iso !== "string") return "—";
  const s = iso.trim();
  if (!s || s === "-" || s === "—") return "—";
  if (/^\d{2}\/\d{2}\/\d{4}\s+às\s+\d{2}:\d{2}/.test(s)) return s;
  const fixedUtcMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})T(00:00|08:00|10:00|12:00):\d{2}(?:\.\d+)?Z$/);
  if (fixedUtcMatch) {
    return `${fixedUtcMatch[3]}/${fixedUtcMatch[2]}/${fixedUtcMatch[1]} às ${fixedUtcMatch[4]}`;
  }
  const dt = new Date(s);
  if (!isNaN(dt.getTime())) {
    const parts = new Intl.DateTimeFormat("pt-BR", {
      timeZone: "America/Cuiaba",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(dt);
    const get = (type: string) => parts.find((p) => p.type === type)?.value || "00";
    return `${get("day")}/${get("month")}/${get("year")} às ${get("hour")}:${get("minute")}`;
  }
  if (s.length >= 16) {
    return `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)} às ${s.slice(11, 16)}`;
  }
  return s;
}

const fmtCellVal = (v: string | number | null | undefined): string => {
  if (v === null || v === undefined) return "—";
  const str = String(v).trim();
  if (!str || str === "-") return "—";
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return fmtDate(str);
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(str)) return fmtIsoDateTimeBr(str);
  return str;
};

export async function gerarPdfRelatorio(relatorio: Relatorio, filtrosDescricao?: string): Promise<void> {
  const { logo, watermark } = await getAssets();

  // If report has more than 5 columns (and is not an individual history sheet), landscape provides optimal reading comfort
  const isLandscape = relatorio.tipo !== "historico" && relatorio.colunas.length > 5;
  const doc = new jsPDF({
    orientation: isLandscape ? "landscape" : "portrait",
    unit: "mm",
    format: "a4",
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginLeft = 14;
  const marginRight = 14;
  const marginTop = 12;
  const marginBottom = 18;
  const contentWidth = pageWidth - marginLeft - marginRight;

  // Draw Header
  let currentY = marginTop;

  // Header Brasão / Logo (top center or top left)
  if (logo) {
    // 15mm x 15mm logo at top left
    doc.addImage(logo, "PNG", marginLeft, currentY, 15, 15);
  }

  // Header Titles
  doc.setTextColor(24, 44, 76); // Deep Navy
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10.5);
  doc.text("ESTADO DE MATO GROSSO", marginLeft + (logo ? 18 : 0), currentY + 4);

  doc.setFontSize(9.5);
  doc.setTextColor(40, 55, 75);
  doc.text("CORPO DE BOMBEIROS MILITAR", marginLeft + (logo ? 18 : 0), currentY + 8.5);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(80, 95, 115);
  doc.text("DIRETORIA DE GESTÃO DE PESSOAS — DGP", marginLeft + (logo ? 18 : 0), currentY + 13);

  // Divider Line
  currentY += 17;
  doc.setDrawColor(200, 210, 225);
  doc.setLineWidth(0.4);
  doc.line(marginLeft, currentY, pageWidth - marginRight, currentY);

  currentY += 5;

  // Report Title
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(15, 25, 45);
  doc.text(relatorio.titulo.toUpperCase(), marginLeft, currentY);

  currentY += 4.5;

  // Report Description & Filter Info
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(90, 105, 120);
  if (relatorio.descricao) {
    doc.text(relatorio.descricao, marginLeft, currentY);
    currentY += 4;
  }

  const infoFiltros = filtrosDescricao || relatorio.filtros || "Todos os registros";
  const geradoFmt =
    relatorio.gerado_em && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(relatorio.gerado_em)
      ? fmtIsoDateTimeBr(relatorio.gerado_em)
      : relatorio.gerado_em;
  const emissao = geradoFmt
    ? `Gerado em: ${geradoFmt}`
    : `Emitido em: ${new Date().toLocaleDateString("pt-BR")} às ${new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
  const totalLinhas = `${relatorio.linhas.length} registro(s)`;
  doc.text(`Filtros: ${infoFiltros}   |   ${emissao}   |   Total: ${totalLinhas}`, marginLeft, currentY);

  currentY += 4;

  // If militar details are provided (e.g. Ficha Funcional Individual), print official identification card
  if (relatorio.militar) {
    const m = relatorio.militar;
    const rawObs = m.observacoes ? String(m.observacoes).trim() : "";
    const hasObs = Boolean(rawObs && rawObs !== "-" && rawObs !== "—" && rawObs.toLowerCase() !== "null");

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    const obsLines: string[] = hasObs
      ? doc.splitTextToSize(`OBSERVAÇÕES: ${rawObs}`, contentWidth - 7)
      : [];

    const boxY = currentY;
    const boxHeight = hasObs ? 23 + obsLines.length * 3.8 + 1.5 : 23;
    doc.setFillColor(244, 247, 252);
    doc.setDrawColor(195, 210, 230);
    doc.setLineWidth(0.3);
    doc.roundedRect(marginLeft, boxY, contentWidth, boxHeight, 1.5, 1.5, "FD");

    // Line 1: Nome & Matrícula
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(18, 32, 58);
    doc.text(`MILITAR: ${String(m.nome_completo || "—").toUpperCase()}`, marginLeft + 3.5, boxY + 4.8);
    doc.text(`MATRÍCULA: ${m.matricula || "—"}`, marginLeft + contentWidth - 46, boxY + 4.8);

    // Line 2: Cargo & UBM
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(45, 60, 80);
    doc.text(`Cargo / Função: ${m.cargo_nome || "—"}`, marginLeft + 3.5, boxY + 10);
    doc.text(`Lotação / UBM: ${m.lotacao_nome || "—"}`, marginLeft + contentWidth / 2, boxY + 10);

    // Line 3: Edital, Inclusão, Vencimento
    const doeStr = m.doe_incorporacao ? String(m.doe_incorporacao).trim() : "";
    doc.text(
      `Edital: ${m.edital_nome || "—"}${doeStr && doeStr !== "-" && doeStr !== "—" ? ` (DOE: ${doeStr})` : ""}`,
      marginLeft + 3.5,
      boxY + 15
    );
    doc.text(
      `Inclusão: ${fmtDate(m.data_inclusao)}   |   Vencimento: ${fmtDate(m.data_vencimento_contrato)}`,
      marginLeft + contentWidth / 2,
      boxY + 15
    );

    // Line 4: Situação
    doc.setFont("helvetica", "bold");
    doc.text(`SITUAÇÃO ATUAL: ${m.status || "ATIVO"}${m.sub_judice ? " (SUB JÚDICE)" : ""}`, marginLeft + 3.5, boxY + 20);
    if (m.data_desligamento) {
      doc.text(`Desligamento: ${fmtDate(m.data_desligamento)} (${m.motivo_desligamento_nome || "—"})`, marginLeft + contentWidth / 2, boxY + 20);
    }

    // Line 5+: OBSERVAÇÕES (when present on the militar's active functional record)
    if (hasObs && obsLines.length > 0) {
      doc.setDrawColor(215, 225, 238);
      doc.setLineWidth(0.2);
      doc.line(marginLeft + 3.5, boxY + 21.8, marginLeft + contentWidth - 3.5, boxY + 21.8);

      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.5);
      doc.setTextColor(30, 45, 70);
      obsLines.forEach((lineText, idx) => {
        if (idx === 0 && lineText.startsWith("OBSERVAÇÕES: ")) {
          const prefix = "OBSERVAÇÕES: ";
          const rest = lineText.slice(prefix.length);
          doc.setFont("helvetica", "bold");
          doc.text(prefix, marginLeft + 3.5, boxY + 25.2 + idx * 3.8);
          const prefixW = doc.getTextWidth(prefix);
          doc.setFont("helvetica", "normal");
          doc.text(rest, marginLeft + 3.5 + prefixW, boxY + 25.2 + idx * 3.8);
        } else {
          doc.setFont("helvetica", "normal");
          doc.text(lineText, marginLeft + 3.5, boxY + 25.2 + idx * 3.8);
        }
      });
    }

    currentY = boxY + boxHeight + 4;
  }

  // Table Columns & Data
  const headCols = relatorio.colunas.map((c) => c.label);
  const bodyRows = relatorio.linhas.map((row) =>
    relatorio.colunas.map((col) => fmtCellVal(row[col.key]))
  );

  // Column alignments & widths (100% contentWidth = 182mm on A4 portrait)
  const columnStyles: Record<number, { halign?: "left" | "center" | "right"; cellWidth?: number }> = {};
  if (relatorio.tipo === "historico" && relatorio.colunas.length === 5) {
    // 5 columns filling 100% of contentWidth (30 + 32 + 22 + 56 + 42 = 182mm)
    columnStyles[0] = { halign: "center", cellWidth: 30 }; // Data/hora do registro
    columnStyles[1] = { halign: "left", cellWidth: 32 };   // Evento
    columnStyles[2] = { halign: "center", cellWidth: 22 }; // Data efetiva
    columnStyles[3] = { halign: "left", cellWidth: 56 };   // Detalhes
    columnStyles[4] = { halign: "left", cellWidth: 42 };   // Observações
  } else {
    relatorio.colunas.forEach((col, idx) => {
      const key = col.key.toLowerCase();
      if (key === "total" || key === "ativos" || key === "desligados" || key === "dias_para_vencer" || key === "quantidade") {
        columnStyles[idx] = { halign: "right" };
      } else if (key === "matricula" || key === "data_inclusao" || key === "data_vencimento_contrato" || key === "data_desligamento" || key === "quando" || key === "data_efetiva" || key === "status") {
        columnStyles[idx] = { halign: "center" };
      }
    });
  }

  // Background watermark dimensions
  const watermarkSize = isLandscape ? 110 : 95;
  const watermarkX = (pageWidth - watermarkSize) / 2;
  const watermarkY = (pageHeight - watermarkSize) / 2;

  // AutoTable
  autoTable(doc, {
    startY: currentY,
    tableWidth: contentWidth,
    head: [headCols],
    body: bodyRows,
    margin: { top: 22, left: marginLeft, right: marginRight, bottom: marginBottom },
    styles: {
      font: "helvetica",
      fontSize: 8,
      cellPadding: 2.2,
      textColor: [30, 41, 59],
      lineColor: [226, 232, 240],
      lineWidth: 0.1,
      overflow: "linebreak",
      valign: "middle",
    },
    headStyles: {
      fillColor: [24, 44, 76], // #182C4C Dark institutional navy
      textColor: [255, 255, 255],
      fontStyle: "bold",
      fontSize: 8.5,
      valign: "middle",
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
    columnStyles,
    didParseCell: (data) => {
      if (data.section === "head" && columnStyles[data.column.index]?.halign) {
        data.cell.styles.halign = columnStyles[data.column.index].halign!;
      }
      // Highlight TOTAL row
      const isTotalRow = Object.values(relatorio.linhas[data.row.index] || {}).some(
        (val) => String(val).toUpperCase() === "TOTAL"
      );
      if (isTotalRow && data.section === "body") {
        data.cell.styles.fontStyle = "bold";
        data.cell.styles.fillColor = [227, 237, 250]; // soft blue highlight
        data.cell.styles.textColor = [15, 30, 60];
      }
    },
    willDrawPage: (_data) => {
      // Draw subtle background watermark behind table content on every page
      if (watermark) {
        try {
          doc.addImage(
            watermark,
            "PNG",
            watermarkX,
            watermarkY,
            watermarkSize,
            watermarkSize,
            undefined,
            "FAST"
          );
        } catch (e) {
          console.warn("Watermark render error:", e);
        }
      }
    },
    didDrawPage: (data) => {
      // On page 2+, draw a subtle compact header
      if (data.pageNumber > 1) {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(8);
        doc.setTextColor(80, 95, 115);
        doc.text("CBMMT / DGP — " + relatorio.titulo.toUpperCase(), marginLeft, 13);

        doc.setFont("helvetica", "normal");
        doc.setFontSize(7);
        doc.setTextColor(130, 140, 155);
        doc.text(
          `Filtros: ${filtrosDescricao || relatorio.filtros || "Geral"}`,
          pageWidth - marginRight,
          13,
          { align: "right" }
        );

        doc.setDrawColor(215, 225, 235);
        doc.setLineWidth(0.3);
        doc.line(marginLeft, 16, pageWidth - marginRight, 16);
      }

      // 2. Footer layout (Note: strictly NO address, NO contact email/url per instructions)
      const footerY = pageHeight - 10;
      doc.setDrawColor(215, 225, 235);
      doc.setLineWidth(0.3);
      doc.line(marginLeft, footerY - 4, pageWidth - marginRight, footerY - 4);

      // Footer Logo (Left)
      if (logo) {
        try {
          doc.addImage(logo, "PNG", marginLeft, footerY - 3, 7.5, 7.5);
        } catch {
          // ignore logo drawing error
        }
      }

      // Institutional footer text next to logo
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.5);
      doc.setTextColor(30, 45, 65);
      const textX = logo ? marginLeft + 9.5 : marginLeft;
      doc.text("Corpo de Bombeiros Militar de Mato Grosso", textX, footerY);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(6.5);
      doc.setTextColor(110, 125, 140);
      doc.text("Diretoria de Gestão de Pessoas / DGP — Sistema de Militares Temporários", textX, footerY + 3.2);

      // Page numbers (Right side, populated dynamically)
      const pageNumber = (doc as any).internal.getCurrentPageInfo().pageNumber;
      const totalPagesExp = "{total_pages_count_string}";
      doc.setFontSize(7.5);
      doc.setTextColor(100, 115, 130);
      doc.text(
        `Página ${pageNumber} de ${totalPagesExp}`,
        pageWidth - marginRight,
        footerY + 1,
        { align: "right" }
      );
    },
  });

  // Calculate and replace total page counts on all pages
  const totalPages = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    // Replace the placeholder with actual total page count
    (doc as any).internal.pageSize; // trigger
    // jsPDF replacement string
    const str = `${totalPages}`;
    const footerY = pageHeight - 10;
    // Replace text inside document
    if (typeof (doc as any).putTotalPages === "function") {
      (doc as any).putTotalPages("{total_pages_count_string}");
    } else {
      // fallback: overwrite in right corner
      doc.setFillColor(255, 255, 255);
      doc.rect(pageWidth - marginRight - 18, footerY - 2, 18, 5, "F");
      doc.setFontSize(7.5);
      doc.setTextColor(100, 115, 130);
      doc.text(`Página ${i} de ${totalPages}`, pageWidth - marginRight, footerY + 1, { align: "right" });
    }
  }

  // File naming
  const slug = relatorio.militar
    ? `HistoricoFuncional_${String(relatorio.militar.matricula || "militar").replace(/[^a-zA-Z0-9]/g, "_")}`
    : `Relatorio_${String(relatorio.tipo || "geral").toLowerCase().replace(/[^a-z0-9]+/g, "_")}`;
  const dateStr = new Date().toISOString().slice(0, 10);
  const fileName = `CBMMT_${slug}_${dateStr}.pdf`;

  doc.save(fileName);
}
