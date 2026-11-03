const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');

const src = path.join(__dirname, '..', '..', 'exports', 'user-msg-876.txt');
const outXlsx = path.join(__dirname, '..', '..', 'exports', 'Unmatched_GP_LineList_Reconciliation.xlsx');

function extractJsonArrays(text) {
  const arrays = [];
  let i = 0;
  while (i < text.length) {
    const start = text.indexOf('[', i);
    if (start === -1) break;
    let depth = 0;
    let inStr = false;
    let esc = false;
    let end = -1;
    for (let j = start; j < text.length; j++) {
      const ch = text[j];
      if (inStr) {
        if (esc) esc = false;
        else if (ch === '\\') esc = true;
        else if (ch === '"') inStr = false;
        continue;
      }
      if (ch === '"') inStr = true;
      else if (ch === '[') depth += 1;
      else if (ch === ']') {
        depth -= 1;
        if (depth === 0) {
          end = j;
          break;
        }
      }
    }
    if (end === -1) break;
    const slice = text.slice(start, end + 1);
    try {
      const parsed = JSON.parse(slice);
      if (Array.isArray(parsed) && parsed.length && typeof parsed[0] === 'object') {
        arrays.push(parsed);
      }
    } catch {
      // ignore non-json brackets
    }
    i = end + 1;
  }
  return arrays;
}

async function main() {
  const raw = fs.readFileSync(src, 'utf8');
  const arrays = extractJsonArrays(raw);
  console.log('arrays found:', arrays.length, 'sizes:', arrays.map((a) => a.length));

  const rows = arrays.flat();
  console.log('total rows:', rows.length);

  const wb = new ExcelJS.Workbook();
  wb.creator = 'TB Mukt UP';
  wb.created = new Date();

  const ws = wb.addWorksheet('Unmatched GPs', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });

  ws.columns = [
    { header: 'Line List S.No.', key: 'sno', width: 14 },
    { header: 'District', key: 'district', width: 18 },
    { header: 'Block', key: 'block', width: 20 },
    { header: 'Line List Panchayat Name', key: 'llName', width: 32 },
    { header: 'Award Category', key: 'award', width: 14 },
    { header: 'UPKSK GP Name (current)', key: 'upkskName', width: 24 },
    { header: 'UPKSK LGD Code (current)', key: 'upkskLgd', width: 20 },
    { header: 'Correct_UPKSK_GP_Name', key: 'correctName', width: 28 },
    { header: 'Correct_LGD_Code', key: 'correctLgd', width: 16 },
    { header: 'Status', key: 'status', width: 14 },
    { header: 'Remarks', key: 'remarks', width: 30 },
  ];

  const header = ws.getRow(1);
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  header.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF1F4E79' },
  };
  header.alignment = { vertical: 'middle', wrapText: true };
  header.height = 28;

  // Highlight fillable columns
  for (const col of [8, 9, 10, 11]) {
    header.getCell(col).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFC65911' },
    };
  }

  for (const r of rows) {
    ws.addRow({
      sno: r['Line List S.No.'] ?? '',
      district: r.District ?? '',
      block: r.Block ?? '',
      llName: r['Line List Panchayat Name'] ?? '',
      award: r['Award Category'] ?? '',
      upkskName: r['UPKSK GP Name'] ?? '',
      upkskLgd: r['UPKSK LGD Code'] ?? '',
      correctName: '',
      correctLgd: '',
      status: '',
      remarks: '',
    });
  }

  // Light yellow for fillable cells
  for (let rowNum = 2; rowNum <= ws.rowCount; rowNum++) {
    for (const col of [8, 9, 10, 11]) {
      ws.getCell(rowNum, col).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFFFF2CC' },
      };
    }
  }

  // Status dropdown
  if (ws.rowCount > 1) {
    ws.dataValidations.add(`J2:J${ws.rowCount}`, {
      type: 'list',
      allowBlank: true,
      formulae: ['"Matched,Not Found,Duplicate,Spelling Fix,Needs Review"'],
      showErrorMessage: true,
      errorTitle: 'Invalid Status',
      error: 'Pick a value from the list',
    });
  }

  // Summary sheet
  const summary = wb.addWorksheet('Summary');
  summary.columns = [
    { header: 'District', key: 'district', width: 22 },
    { header: 'Unmatched Count', key: 'count', width: 18 },
  ];
  summary.getRow(1).font = { bold: true };

  const byDistrict = new Map();
  for (const r of rows) {
    const d = r.District || '(blank)';
    byDistrict.set(d, (byDistrict.get(d) || 0) + 1);
  }
  [...byDistrict.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .forEach(([district, count]) => summary.addRow({ district, count }));

  summary.addRow({});
  summary.addRow({ district: 'TOTAL', count: rows.length }).font = { bold: true };

  // Instructions
  const help = wb.addWorksheet('Instructions');
  help.getColumn(1).width = 100;
  const lines = [
    'Unmatched GP Line List – Reconciliation Sheet',
    '',
    'Purpose: Fill Correct_UPKSK_GP_Name and Correct_LGD_Code for each unmatched Line List panchayat.',
    '',
    'How to fill:',
    '1. Orange header columns (yellow cells) are for your team to complete.',
    '2. Correct_UPKSK_GP_Name = exact Gram Panchayat name as in UPKSK / GPPopulation master.',
    '3. Correct_LGD_Code = GP LGD code (G_LGD) from master.',
    '4. Status dropdown: Matched / Not Found / Duplicate / Spelling Fix / Needs Review.',
    '5. Remarks = optional notes (e.g. merged GP, renamed, wrong block).',
    '',
    `Total unmatched rows in this file: ${rows.length}`,
    `Source arrays merged: ${arrays.length}`,
    `Generated: ${new Date().toISOString()}`,
  ];
  lines.forEach((t, idx) => {
    help.getCell(idx + 1, 1).value = t;
    if (idx === 0) help.getCell(idx + 1, 1).font = { bold: true, size: 14 };
  });

  await wb.xlsx.writeFile(outXlsx);
  console.log('Wrote', outXlsx);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
