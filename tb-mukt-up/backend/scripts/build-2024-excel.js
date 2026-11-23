const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');

const rawPath = path.join(__dirname, '..', '..', 'exports', 'user-msg-2024-raw.txt');
let raw = fs.readFileSync(rawPath, 'utf8');
// Fix invalid NaN literals so JSON.parse works
raw = raw.replace(/\bNaN\b/g, 'null');

function extractArrays(text) {
  const arrays = [];
  let i = 0;
  while (i < text.length) {
    if (text[i] === '[') {
      let depth = 0;
      let inStr = false;
      let esc = false;
      let start = i;
      for (let j = i; j < text.length; j++) {
        const c = text[j];
        if (inStr) {
          if (esc) esc = false;
          else if (c === '\\') esc = true;
          else if (c === '"') inStr = false;
          continue;
        }
        if (c === '"') inStr = true;
        else if (c === '[') depth++;
        else if (c === ']') {
          depth--;
          if (depth === 0) {
            const slice = text.slice(start, j + 1);
            try {
              const parsed = JSON.parse(slice);
              if (Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0] === 'object') {
                arrays.push(parsed);
              }
            } catch (_) {}
            i = j + 1;
            break;
          }
        }
      }
      if (depth !== 0) break;
      continue;
    }
    i++;
  }
  return arrays;
}

const arrays = extractArrays(raw);
console.log('arrays found:', arrays.length, arrays.map((a) => a.length));

if (arrays.length < 2) {
  console.error('Expected 2 JSON arrays');
  process.exit(1);
}

// Prefer the smaller NaN-style unmatched list as sheet 1, larger camelCase as sheet 2
const sorted = [...arrays].sort((a, b) => a.length - b.length);
const unmatched = sorted[0];
const fullList = sorted[sorted.length - 1];

function normalizeUnmatched(row) {
  return {
    lineListSNo: row['Line List S.No.'] ?? row.lineListSNo ?? null,
    district: row.District ?? row.district ?? null,
    block: row.Block ?? row.block ?? null,
    panchayatName: row['Line List Panchayat Name'] ?? row.panchayatName ?? null,
    awardCategory: row['Award Category'] ?? row.awardCategory ?? null,
    upkskGpName: row['UPKSK GP Name'] ?? row.upkskGpName ?? null,
    upkskLgdCode: row['UPKSK LGD Code'] ?? row.upkskLgdCode ?? null,
    occurrences: row.occurrences ?? null,
    remark: row.remark ?? null,
  };
}

function normalizeFull(row) {
  return {
    lineListSNo: row.lineListSNo ?? row['Line List S.No.'] ?? null,
    district: row.district ?? row.District ?? null,
    block: row.block ?? row.Block ?? null,
    panchayatName: row.panchayatName ?? row['Line List Panchayat Name'] ?? null,
    awardCategory: row.awardCategory ?? row['Award Category'] ?? null,
    occurrences: row.occurrences ?? null,
    upkskGpName: row.upkskGpName ?? row['UPKSK GP Name'] ?? null,
    upkskLgdCode: row.upkskLgdCode ?? row['UPKSK LGD Code'] ?? null,
    remark: row.remark ?? null,
  };
}

const unmatchedNorm = unmatched.map(normalizeUnmatched);
const fullNorm = fullList.map(normalizeFull);

const stillUnmatched = fullNorm.filter(
  (r) =>
    r.upkskLgdCode == null ||
    r.upkskGpName == null ||
    String(r.upkskGpName).trim() === '' ||
    String(r.upkskGpName).trim().toUpperCase() === 'NA' ||
    String(r.upkskGpName).includes('not Found') ||
    String(r.upkskGpName).includes('Not Found') ||
    String(r.upkskGpName).includes('Block not Found')
);

async function main() {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'TB Mukt UP';
  wb.created = new Date();

  const headerStyle = {
    font: { bold: true, color: { argb: 'FFFFFFFF' } },
    fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E79' } },
    alignment: { vertical: 'middle', wrapText: true },
  };

  function addSheet(name, rows, columns) {
    const ws = wb.addWorksheet(name, {
      views: [{ state: 'frozen', ySplit: 1 }],
    });
    ws.columns = columns;
    ws.getRow(1).eachCell((cell) => {
      Object.assign(cell, { style: headerStyle });
    });
    // re-apply header after columns set
    const headerRow = ws.getRow(1);
    headerRow.values = columns.map((c) => c.header);
    headerRow.font = headerStyle.font;
    headerRow.fill = headerStyle.fill;
    headerRow.alignment = headerStyle.alignment;
    headerRow.height = 22;

    for (const r of rows) {
      ws.addRow(r);
    }
    return ws;
  }

  addSheet(
    'Unmatched Only 2024',
    unmatchedNorm,
    [
      { header: 'Line List S.No.', key: 'lineListSNo', width: 14 },
      { header: 'District', key: 'district', width: 18 },
      { header: 'Block', key: 'block', width: 22 },
      { header: 'Line List Panchayat Name', key: 'panchayatName', width: 32 },
      { header: 'Award Category', key: 'awardCategory', width: 14 },
      { header: 'UPKSK GP Name', key: 'upkskGpName', width: 28 },
      { header: 'UPKSK LGD Code', key: 'upkskLgdCode', width: 14 },
      { header: 'Occurrences', key: 'occurrences', width: 12 },
      { header: 'Remark', key: 'remark', width: 36 },
      { header: 'Correct UPKSK GP Name', key: 'correctName', width: 28 },
      { header: 'Correct LGD Code', key: 'correctLgd', width: 16 },
      { header: 'Notes', key: 'notes', width: 30 },
    ]
  );

  addSheet(
    'Full Reconciliation 2024',
    fullNorm,
    [
      { header: 'Line List S.No.', key: 'lineListSNo', width: 14 },
      { header: 'District', key: 'district', width: 18 },
      { header: 'Block', key: 'block', width: 22 },
      { header: 'Panchayat Name', key: 'panchayatName', width: 32 },
      { header: 'Award Category', key: 'awardCategory', width: 14 },
      { header: 'Occurrences', key: 'occurrences', width: 12 },
      { header: 'UPKSK GP Name', key: 'upkskGpName', width: 28 },
      { header: 'UPKSK LGD Code', key: 'upkskLgdCode', width: 14 },
      { header: 'Remark', key: 'remark', width: 36 },
    ]
  );

  addSheet(
    'Still Unmatched (from full)',
    stillUnmatched,
    [
      { header: 'Line List S.No.', key: 'lineListSNo', width: 14 },
      { header: 'District', key: 'district', width: 18 },
      { header: 'Block', key: 'block', width: 22 },
      { header: 'Panchayat Name', key: 'panchayatName', width: 32 },
      { header: 'Award Category', key: 'awardCategory', width: 14 },
      { header: 'Occurrences', key: 'occurrences', width: 12 },
      { header: 'UPKSK GP Name', key: 'upkskGpName', width: 28 },
      { header: 'UPKSK LGD Code', key: 'upkskLgdCode', width: 14 },
      { header: 'Remark', key: 'remark', width: 36 },
      { header: 'Correct UPKSK GP Name', key: 'correctName', width: 28 },
      { header: 'Correct LGD Code', key: 'correctLgd', width: 16 },
      { header: 'Notes', key: 'notes', width: 30 },
    ]
  );

  const summary = wb.addWorksheet('Summary');
  summary.columns = [
    { header: 'Metric', key: 'metric', width: 40 },
    { header: 'Value', key: 'value', width: 16 },
  ];
  summary.getRow(1).font = { bold: true };
  summary.addRows([
    { metric: 'Year', value: '2024' },
    { metric: 'Unmatched-only list (sheet 1) rows', value: unmatchedNorm.length },
    { metric: 'Full reconciliation list rows', value: fullNorm.length },
    { metric: 'Still unmatched in full list', value: stillUnmatched.length },
    { metric: 'Matched / has LGD in full list', value: fullNorm.length - stillUnmatched.length },
  ]);

  const instr = wb.addWorksheet('Instructions');
  instr.getColumn(1).width = 100;
  [
    '2024 Line List ↔ UPKSK GP reconciliation workbook',
    '',
    'Sheet 1 – Unmatched Only 2024: GPs from Line List that did not map to UPKSK (blank LGD). Fill Correct UPKSK GP Name / Correct LGD Code.',
    'Sheet 2 – Full Reconciliation 2024: full mapping dump (matched + unmatched) for audit.',
    'Sheet 3 – Still Unmatched (from full): rows in full list with null/NA/Not Found LGD or name — use for review email.',
    '',
    'How to fill: use district + block context, search UPKSK / GramPanchayat master by similar spelling, put official name + LGD in Correct columns.',
  ].forEach((t, i) => {
    instr.getCell(i + 1, 1).value = t;
  });

  const outDir = path.join(__dirname, '..', '..', 'exports');
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, 'Unmatched_GP_LineList_Reconciliation_2024.xlsx');
  await wb.xlsx.writeFile(outPath);
  console.log('Wrote', outPath);
  console.log({
    unmatched: unmatchedNorm.length,
    full: fullNorm.length,
    stillUnmatched: stillUnmatched.length,
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
