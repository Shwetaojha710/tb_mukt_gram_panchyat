/**
 * Auto-fill Correct UPKSK GP Name + Correct LGD Code
 * by fuzzy-matching Line List names against dbo.GramPanchayat.
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const ExcelJS = require('exceljs');
const { query } = require('../src/config/db');

const EXPORTS = path.join(__dirname, '..', '..', 'exports');

function normalize(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\b(gram\s*panchayat|grampanchayat|g\.?\s*p\.?|gp)\b/g, ' ')
    .replace(/\b(chc|phc|ph|ch|upc|uphc|dh|sdh|th|thc|block)\b/g, ' ')
    // common transliteration variants
    .replace(/aa/g, 'a')
    .replace(/ee/g, 'i')
    .replace(/oo/g, 'u')
    .replace(/v/g, 'w')
    .replace(/y/g, 'i')
    .replace(/\s+/g, ' ')
    .trim();
}

function bigrams(s) {
  const t = ` ${s} `;
  const out = [];
  for (let i = 0; i < t.length - 1; i++) out.push(t.slice(i, i + 2));
  return out;
}

function dice(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const A = bigrams(a);
  const B = bigrams(b);
  if (!A.length || !B.length) return 0;
  const counts = new Map();
  for (const x of A) counts.set(x, (counts.get(x) || 0) + 1);
  let inter = 0;
  for (const x of B) {
    const c = counts.get(x) || 0;
    if (c > 0) {
      inter += 1;
      counts.set(x, c - 1);
    }
  }
  return (2 * inter) / (A.length + B.length);
}

function levRatio(a, b) {
  if (a === b) return 1;
  const m = a.length;
  const n = b.length;
  if (!m || !n) return 0;
  if (Math.abs(m - n) > Math.max(m, n) * 0.45) return 0;
  const dp = new Array(n + 1);
  for (let j = 0; j <= n; j++) dp[j] = j;
  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j];
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + cost);
      prev = tmp;
    }
  }
  return 1 - dp[n] / Math.max(m, n);
}

function scoreNames(a, b) {
  const d = dice(a, b);
  const l = levRatio(a, b);
  let s = 0.55 * d + 0.45 * l;

  const ta = a.split(' ').filter(Boolean);
  const tb = b.split(' ').filter(Boolean);
  const sa = new Set(ta);
  const sb = new Set(tb);

  // Full-token containment only (avoid "Lakadpura" ↔ "PURA")
  const shorter = a.length <= b.length ? a : b;
  const longerTokens = a.length <= b.length ? sb : sa;
  if (shorter.length >= 5 && longerTokens.has(shorter)) {
    const longer = a.length > b.length ? a : b;
    const ratio = shorter.length / longer.length;
    if (ratio >= 0.45) s = Math.max(s, 0.9);
    else s = Math.max(s, 0.78);
  }

  if (sa.size && sb.size) {
    let inter = 0;
    for (const t of sa) if (sb.has(t)) inter += 1;
    if (inter) {
      const jacc = inter / (sa.size + sb.size - inter);
      // require overlapping tokens to be meaningful length
      const meaningful = [...sa].some((t) => t.length >= 4 && sb.has(t));
      if (meaningful) s = Math.max(s, jacc * 0.95);
    }
  }
  return s;
}

async function loadMaster() {
  console.log('Loading GramPanchayat master...');
  const r = await query(`
    SELECT
      gp.GramPanchayatName AS gpName,
      CAST(gp.G_LGD AS NVARCHAR(50)) AS lgd,
      b.BlockName AS blockName,
      d.DistrictName AS districtName
    FROM dbo.GramPanchayat gp
    LEFT JOIN dbo.Block b ON b.PK_UniqueID = gp.FK_BlockID AND ISNULL(b.IsDeleted,0)=0
    LEFT JOIN dbo.District d ON d.PK_UniqueID = b.FK_DistrictID AND ISNULL(d.IsDeleted,0)=0
    WHERE ISNULL(gp.IsDeleted,0)=0
      AND gp.GramPanchayatName IS NOT NULL
      AND gp.G_LGD IS NOT NULL
  `);
  const byDistrict = new Map();
  for (const row of r.recordset) {
    const dNorm = normalize(row.districtName);
    if (!dNorm) continue;
    if (!byDistrict.has(dNorm)) byDistrict.set(dNorm, []);
    byDistrict.get(dNorm).push({
      gpName: String(row.gpName).trim(),
      lgd: String(row.lgd).trim(),
      blockName: row.blockName ? String(row.blockName).trim() : '',
      nName: normalize(row.gpName),
      nBlock: normalize(row.blockName),
    });
  }
  console.log('Districts with GPs:', byDistrict.size, 'total GPs:', r.recordset.length);
  return byDistrict;
}

function findDistrictKey(byDistrict, district) {
  const d = normalize(district);
  if (byDistrict.has(d)) return d;
  // soft district match
  let best = null;
  let bestScore = 0;
  for (const key of byDistrict.keys()) {
    const s = scoreNames(d, key);
    if (s > bestScore) {
      bestScore = s;
      best = key;
    }
  }
  if (bestScore >= 0.9) return best;
  return d;
}

function matchRow(byDistrict, district, block, panchayat) {
  const dKey = findDistrictKey(byDistrict, district);
  const candidates = byDistrict.get(dKey) || [];
  if (!candidates.length) {
    return { status: 'No district master', confidence: '', correctName: '', correctLgd: '', notes: `District not in master: ${district}` };
  }

  const nName = normalize(panchayat);
  const nBlock = normalize(block);
  if (!nName) {
    return { status: 'Data error', confidence: '', correctName: '', correctLgd: '', notes: 'Blank panchayat name' };
  }

  // Prefer candidates in matching / similar block
  const blockMatched = [];
  const others = [];
  for (const c of candidates) {
    if (!nBlock || !c.nBlock) {
      others.push(c);
      continue;
    }
    const bs = scoreNames(nBlock, c.nBlock);
    if (bs >= 0.82 || nBlock.includes(c.nBlock) || c.nBlock.includes(nBlock)) blockMatched.push(c);
    else others.push(c);
  }

  const pools = [
    { list: blockMatched, blockBoost: 0.06, label: 'block' },
    { list: others, blockBoost: 0, label: 'district' },
  ];

  let best = null;
  for (const pool of pools) {
    for (const c of pool.list) {
      let s = scoreNames(nName, c.nName);
      if (nName === c.nName) s = 1;
      s += pool.blockBoost;
      if (!best || s > best.score) {
        best = { ...c, score: Math.min(s, 1), scope: pool.label };
      }
    }
    // if strong block-scoped hit, stop
    if (best && best.scope === 'block' && best.score >= 0.88) break;
  }

  if (!best) {
    return { status: 'Not in UPKSK', confidence: '', correctName: '', correctLgd: '', notes: 'No GP candidates' };
  }

  const pct = Math.round(best.score * 100);
  if (best.score >= 0.92) {
    return {
      status: 'Auto-matched',
      confidence: 'High',
      correctName: best.gpName,
      correctLgd: best.lgd,
      notes: `${pct}% · ${best.scope} · master block: ${best.blockName}`,
    };
  }
  if (best.score >= 0.82) {
    return {
      status: 'Suggested',
      confidence: 'Medium',
      correctName: best.gpName,
      correctLgd: best.lgd,
      notes: `${pct}% · REVIEW · ${best.scope} · master block: ${best.blockName}`,
    };
  }
  if (best.score >= 0.75) {
    return {
      status: 'Weak suggest',
      confidence: 'Low',
      correctName: best.gpName,
      correctLgd: best.lgd,
      notes: `${pct}% · VERIFY · best: ${best.gpName} (${best.blockName})`,
    };
  }
  return {
    status: 'Not matched',
    confidence: '',
    correctName: '',
    correctLgd: '',
    notes: `Best only ${pct}%: ${best.gpName} / ${best.blockName} — left blank`,
  };
}

function yellowFill() {
  return {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFFFF2CC' },
  };
}

function greenFill() {
  return {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFC6EFCE' },
  };
}

function amberFill() {
  return {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFFCE4D6' },
  };
}

async function fillWorkbook2024(byDistrict) {
  const inPath = path.join(EXPORTS, 'Unmatched_GP_LineList_Reconciliation_2024.xlsx');
  const outPath = path.join(EXPORTS, 'Unmatched_GP_LineList_Reconciliation_2024_FILLED.xlsx');
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(inPath);

  const specs = [
    {
      name: 'Unmatched Only 2024',
      cols: {
        district: 2,
        block: 3,
        panchayat: 4,
        correctName: 10,
        correctLgd: 11,
        notes: 12,
      },
    },
    {
      name: 'Still Unmatched (from full)',
      cols: {
        district: 2,
        block: 3,
        panchayat: 4,
        correctName: 10,
        correctLgd: 11,
        notes: 12,
      },
    },
  ];

  const stats = {};

  for (const spec of specs) {
    const ws = wb.getWorksheet(spec.name);
    // Add Status + Confidence columns if missing
    const header = ws.getRow(1);
    let statusCol = null;
    let confCol = null;
    header.eachCell((cell, col) => {
      const v = String(cell.value || '');
      if (/^status$/i.test(v)) statusCol = col;
      if (/confidence/i.test(v)) confCol = col;
    });
    if (!statusCol) {
      statusCol = (spec.cols.notes || 12) + 1;
      header.getCell(statusCol).value = 'Status';
      header.getCell(statusCol).font = { bold: true, color: { argb: 'FFFFFFFF' } };
      header.getCell(statusCol).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF1F4E79' },
      };
      ws.getColumn(statusCol).width = 14;
    }
    if (!confCol) {
      confCol = statusCol + 1;
      header.getCell(confCol).value = 'Confidence';
      header.getCell(confCol).font = { bold: true, color: { argb: 'FFFFFFFF' } };
      header.getCell(confCol).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF1F4E79' },
      };
      ws.getColumn(confCol).width = 12;
    }

    let filled = 0;
    let blank = 0;
    let high = 0;
    let med = 0;
    let low = 0;

    for (let i = 2; i <= ws.rowCount; i++) {
      const row = ws.getRow(i);
      const district = row.getCell(spec.cols.district).value;
      const block = row.getCell(spec.cols.block).value;
      const panchayat = row.getCell(spec.cols.panchayat).value;
      if (!district && !panchayat) continue;

      const m = matchRow(byDistrict, district, block, panchayat);
      row.getCell(spec.cols.correctName).value = m.correctName || null;
      row.getCell(spec.cols.correctLgd).value = m.correctLgd || null;
      row.getCell(spec.cols.notes).value = m.notes || null;
      row.getCell(statusCol).value = m.status;
      row.getCell(confCol).value = m.confidence || null;

      const fill =
        m.confidence === 'High'
          ? greenFill()
          : m.confidence === 'Medium'
            ? amberFill()
            : m.confidence === 'Low'
              ? yellowFill()
              : yellowFill();

      row.getCell(spec.cols.correctName).fill = fill;
      row.getCell(spec.cols.correctLgd).fill = fill;

      if (m.correctName) {
        filled += 1;
        if (m.confidence === 'High') high += 1;
        else if (m.confidence === 'Medium') med += 1;
        else low += 1;
      } else blank += 1;
    }

    stats[spec.name] = { filled, blank, high, med, low, total: filled + blank };
  }

  // Update instructions
  let instr = wb.getWorksheet('Instructions');
  if (!instr) instr = wb.addWorksheet('Instructions');
  instr.getColumn(1).width = 110;
  [
    '2024 Line List ↔ UPKSK GP — AUTO-FILLED Correct columns',
    '',
    'Correct UPKSK GP Name / Correct LGD Code were filled from dbo.GramPanchayat (G_LGD) using district + block fuzzy match.',
    'Colour: Green = High confidence (≥92%), Amber = Medium (≥82% — please REVIEW), Yellow = Low / blank.',
    'Status: Auto-matched | Suggested | Weak suggest | Not matched | No district master',
    'Notes show match % and master block used. Please verify Medium/Low before emailing.',
    '',
    `Generated: ${new Date().toISOString()}`,
  ].forEach((t, i) => {
    instr.getCell(i + 1, 1).value = t;
  });

  // Summary extras
  let summary = wb.getWorksheet('Summary');
  if (summary) {
    summary.addRow({});
    summary.addRow({ metric: '--- Auto-fill stats ---', value: '' });
    for (const [name, s] of Object.entries(stats)) {
      summary.addRow({ metric: `${name} · filled`, value: s.filled });
      summary.addRow({ metric: `${name} · high`, value: s.high });
      summary.addRow({ metric: `${name} · medium (review)`, value: s.med });
      summary.addRow({ metric: `${name} · low (verify)`, value: s.low });
      summary.addRow({ metric: `${name} · left blank`, value: s.blank });
    }
  }

  await wb.xlsx.writeFile(outPath);
  console.log('Wrote', outPath);
  console.log(stats);
  return { outPath, stats };
}

async function fillWorkbookMain(byDistrict) {
  const inPath = path.join(EXPORTS, 'Unmatched_GP_LineList_Reconciliation.xlsx');
  const outPath = path.join(EXPORTS, 'Unmatched_GP_LineList_Reconciliation_FILLED.xlsx');
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(inPath);
  const ws = wb.getWorksheet('Unmatched GPs') || wb.worksheets[0];

  const headerVals = [];
  ws.getRow(1).eachCell({ includeEmpty: true }, (cell, colNumber) => {
    const raw = cell.value;
    const text =
      raw && typeof raw === 'object' && raw.text != null
        ? String(raw.text)
        : raw && typeof raw === 'object' && raw.richText
          ? raw.richText.map((x) => x.text).join('')
          : String(raw == null ? '' : raw);
    headerVals[colNumber] = text.toLowerCase().trim();
  });
  const findCol = (...preds) => {
    for (let c = 1; c < headerVals.length; c++) {
      const h = headerVals[c] || '';
      if (preds.every((p) => p(h))) return c;
    }
    return -1;
  };
  const idx = {
    district: findCol((h) => h === 'district'),
    block: findCol((h) => h === 'block'),
    panchayat: findCol((h) => h.includes('panchayat')),
    correctName: findCol((h) => h.includes('correct') && h.includes('name')),
    correctLgd: findCol((h) => h.includes('correct') && h.includes('lgd')),
    status: findCol((h) => h === 'status'),
    remarks: findCol((h) => h.includes('remark')),
  };

  const col = (name) => {
    const i = idx[name];
    if (i < 1) throw new Error(`Column not found: ${name} :: ${JSON.stringify(headerVals)}`);
    return i;
  };

  let filled = 0;
  let blank = 0;
  let high = 0;
  let med = 0;
  let low = 0;

  for (let i = 2; i <= ws.rowCount; i++) {
    const row = ws.getRow(i);
    const district = row.getCell(col('district')).value;
    const block = row.getCell(col('block')).value;
    const panchayat = row.getCell(col('panchayat')).value;
    if (!district && !panchayat) continue;

    const m = matchRow(byDistrict, district, block, panchayat);
    row.getCell(col('correctName')).value = m.correctName || null;
    row.getCell(col('correctLgd')).value = m.correctLgd || null;
    if (idx.status > 0) row.getCell(col('status')).value = m.status;
    if (idx.remarks > 0) row.getCell(col('remarks')).value = m.notes;

    const fill =
      m.confidence === 'High'
        ? greenFill()
        : m.confidence === 'Medium'
          ? amberFill()
          : yellowFill();
    row.getCell(col('correctName')).fill = fill;
    row.getCell(col('correctLgd')).fill = fill;

    if (m.correctName) {
      filled += 1;
      if (m.confidence === 'High') high += 1;
      else if (m.confidence === 'Medium') med += 1;
      else low += 1;
    } else blank += 1;
  }

  const stats = { filled, blank, high, med, low, total: filled + blank };
  await wb.xlsx.writeFile(outPath);
  console.log('Wrote', outPath);
  console.log('main stats', stats);
  return { outPath, stats };
}

async function main() {
  const byDistrict = await loadMaster();
  const a = await fillWorkbook2024(byDistrict);
  const b = await fillWorkbookMain(byDistrict);
  console.log('\nDONE');
  console.log('2024 filled:', a.outPath);
  console.log('Main filled:', b.outPath);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
