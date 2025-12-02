import type { Loan, Payment, PaymentSchedule, Client } from "./types"
import * as XLSX from "xlsx"
import { parseYMDToUTC, translateStatus } from "./utils"
import * as fs from "fs"
import * as path from "path"

export function generateLoansExcel(loans: (Loan & { client: Client })[]): Buffer {
  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.aoa_to_sheet([]);

  // --- 1. Añadir Logo ---
  try {
    const logoPath = path.resolve(process.cwd(), "public", "logoCooperativaSinTextoSinFondo.png");
    if (fs.existsSync(logoPath)) {
      const logoBuffer = fs.readFileSync(logoPath);
      // Esta es una forma de "engañar" a la librería para que inserte una imagen.
      // No es oficial y puede no funcionar en todos los visores de Excel.
      if (!worksheet["!images"]) worksheet["!images"] = [];
      worksheet["!images"].push({
        name: 'logo.png',
        data: logoBuffer,
        opts: { base64: true },
        position: {
          type: 'twoCellAnchor',
          attrs: {
            editAs: 'oneCell',
            from: { col: 1, row: 1 },
            to: { col: 2, row: 4 }
          }
        }
      });
    }
  } catch (e) {
    console.error("Error al leer el logo:", e);
  }

  // --- 2. Títulos y Encabezados ---
  const title = "Reporte General de Préstamos";
  const subtitle = `Generado el: ${new Date().toLocaleDateString("es-GT")}`;
  
  XLSX.utils.sheet_add_aoa(worksheet, [[title]], { origin: "C2" });
  XLSX.utils.sheet_add_aoa(worksheet, [[subtitle]], { origin: "C3" });

  // --- 3. Preparar Datos de la Tabla ---
  const headers = [
    "Número de Préstamo", "Cliente", "Teléfono", "Monto", "Tasa de Interés",
    "Plazo (meses)", "Cuota Mensual", "Estado", "Fecha de Inicio", "Fecha de Fin",
  ];

  const rows = loans.map((loan) => [
    loan.loanNumber,
    `${loan.client.first_name} ${loan.client.last_name}`,
    loan.client.phone,
    loan.amount,
    loan.interestRate / 100,
    loan.termMonths,
    loan.monthlyPayment,
    translateStatus(loan.status),
    parseYMDToUTC(loan.startDate),
    parseYMDToUTC(loan.endDate),
  ]);


  XLSX.utils.sheet_add_aoa(worksheet, rows, { origin: "A6" });

  // --- 4. Estilos y Formatos ---
  worksheet["!cols"] = [
    { wch: 22 }, { wch: 35 }, { wch: 15 }, { wch: 18 }, { wch: 15 },
    { wch: 15 }, { wch: 18 }, { wch: 15 }, { wch: 15 }, { wch: 15 },
  ];

  const headerStyle = {
    font: { color: { rgb: "FFFFFF" }, bold: true },
    fill: { fgColor: { rgb: "002060" } },
    alignment: { horizontal: "center", vertical: "center" },
  };

  headers.forEach((header, index) => {
    const cellAddress = XLSX.utils.encode_cell({ r: 4, c: index });
    worksheet[cellAddress] = { v: header, s: headerStyle };
  });

  if (worksheet["C2"]) {
    worksheet["C2"].s = { font: { sz: 16, bold: true } };
  }
  worksheet["!merges"] = [{ s: { r: 1, c: 2 }, e: { r: 1, c: 5 } }]; // C2 a F2

  for (let i = 6; i <= rows.length + 5; i++) {
    if (worksheet[`D${i}`]) worksheet[`D${i}`].z = '"Q"#,##0.00';
    if (worksheet[`E${i}`]) worksheet[`E${i}`].z = "0.00%";
    if (worksheet[`G${i}`]) worksheet[`G${i}`].z = '"Q"#,##0.00';
    if (worksheet[`I${i}`]) worksheet[`I${i}`].z = "dd/mm/yyyy";
    if (worksheet[`J${i}`]) worksheet[`J${i}`].z = "dd/mm/yyyy";
  }

  XLSX.utils.book_append_sheet(workbook, worksheet, "Préstamos");
  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
  return buffer;
}

export function generatePaymentScheduleExcel(
  loan: Loan & { client: Client },
  schedule: PaymentSchedule[],
  payments: Payment[],
): Buffer {
  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.aoa_to_sheet([]);

  // --- 1. Añadir Logo ---
  try {
    const logoPath = path.resolve(process.cwd(), "public", "logoCooperativaSinTextoSinFondo.png");
    if (fs.existsSync(logoPath)) {
      const logoBuffer = fs.readFileSync(logoPath);
      if (!worksheet["!images"]) worksheet["!images"] = [];
      worksheet["!images"].push({
        name: 'logo.png',
        data: logoBuffer,
        opts: { base64: true },
        position: {
          type: 'twoCellAnchor',
          attrs: {
            editAs: 'oneCell',
            from: { col: 1, row: 1 },
            to: { col: 2, row: 4 }
          }
        }
      });
    }
  } catch (e) {
    console.error("Error al leer el logo:", e);
  }

  // --- 2. Títulos y Encabezados ---
  const title = `Plan de Pagos - ${loan.loanNumber}`;
  const clientInfo = `Cliente: ${loan.client.first_name} ${loan.client.last_name}`;
  const amountInfo = `Monto prestado: ${new Intl.NumberFormat('es-GT', { style: 'currency', currency: 'GTQ' }).format(Number(loan.amount) || 0)}`;

  XLSX.utils.sheet_add_aoa(worksheet, [[title]], { origin: "C2" });
  XLSX.utils.sheet_add_aoa(worksheet, [[clientInfo]], { origin: "A6" });
  XLSX.utils.sheet_add_aoa(worksheet, [[amountInfo]], { origin: "A7" });

  // --- 3. Preparar Datos de la Tabla ---
  const headers = [
    "Cuota #", "Fecha de Vencimiento", "Monto", "Capital", "Interés",
    "Estado", "Fecha de Pago", "N° Recibo",
  ];

  const rows = schedule.map((item) => {
    const payment = payments.find((p) => p.scheduleId === item.id);
    const totalDue = Number(item.amount || 0) + Number(item.admin_fees || 0) + Number(item.mora || 0);
    return [
      item.paymentNumber,
      parseYMDToUTC(item.dueDate),
      totalDue,
      item.principal,
      item.interest,
      translateStatus(item.status),
      payment ? parseYMDToUTC(payment.paymentDate) : "-",
      payment ? payment.receiptNumber : "-",
    ];
  });

  XLSX.utils.sheet_add_aoa(worksheet, [headers], { origin: "A9" });
  XLSX.utils.sheet_add_aoa(worksheet, rows, { origin: "A10" });

  // --- 4. Estilos y Formatos ---
  worksheet["!cols"] = [
    { wch: 10 }, { wch: 20 }, { wch: 15 }, { wch: 15 }, { wch: 15 },
    { wch: 15 }, { wch: 20 }, { wch: 20 },
  ];

  const headerStyle = {
    font: { color: { rgb: "FFFFFF" }, bold: true },
    fill: { fgColor: { rgb: "002060" } },
    alignment: { horizontal: "center", vertical: "center" },
  };

  headers.forEach((_, index) => {
    const cellAddress = XLSX.utils.encode_cell({ r: 8, c: index });
    if (worksheet[cellAddress]) {
      worksheet[cellAddress].s = headerStyle;
    }
  });

  if (worksheet["C2"]) {
    worksheet["C2"].s = { font: { sz: 16, bold: true } };
  }
  worksheet["!merges"] = [{ s: { r: 1, c: 2 }, e: { r: 1, c: 5 } }]; // C2 a F2

  for (let i = 10; i <= rows.length + 9; i++) {
    if(worksheet[`B${i}`]) worksheet[`B${i}`].z = "dd/mm/yyyy";
    if(worksheet[`C${i}`]) worksheet[`C${i}`].z = '"Q"#,##0.00';
    if(worksheet[`D${i}`]) worksheet[`D${i}`].z = '"Q"#,##0.00';
    if(worksheet[`E${i}`]) worksheet[`E${i}`].z = '"Q"#,##0.00';
    if (worksheet[`G${i}`] && worksheet[`G${i}`].v !== "-") {
      worksheet[`G${i}`].z = "dd/mm/yyyy";
    }
  }

  XLSX.utils.book_append_sheet(workbook, worksheet, "Plan de Pagos");
  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
  return buffer;
}
