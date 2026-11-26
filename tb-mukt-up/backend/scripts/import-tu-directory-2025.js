/**
 * Builds year-wise TU directory JSON from the official Excel.
 * Source: District-wise Number of TUs 2025.xlsx
 * Output: backend/data/tu-directory/2025.json
 *
 * Usage:
 *   node scripts/import-tu-directory-2025.js "C:\path\to\file.xlsx"
 */
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

const year = 2025;
const src =
  process.argv[2] ||
  path.join(
    process.env.USERPROFILE || '',
    'Downloads',
    'District-wise Number of TUs 2025 (1).xlsx'
  );

if (!fs.existsSync(src)) {
  console.error('Excel not found:', src);
  process.exit(1);
}

const wb = XLSX.readFile(src);
const sheet = wb.Sheets['District-wise TUs'] || wb.Sheets[wb.SheetNames[1]];
if (!sheet) {
  console.error('Sheet "District-wise TUs" not found. Sheets:', wb.SheetNames);
  process.exit(1);
}

const detail = XLSX.utils.sheet_to_json(sheet, { defval: null });
const byDistrict = new Map();

for (const row of detail) {
  const district = String(row.DISTRICT || row.District || '').trim();
  const tu = String(row.TU || row.Tu || '').trim();
  if (!district || !tu) continue;

  const targetKey = Object.keys(row).find((k) =>
    String(k).toLowerCase().includes('annual notification')
  );
  const target = Number(targetKey ? row[targetKey] : 0) || 0;

  if (!byDistrict.has(district)) byDistrict.set(district, []);
  byDistrict.get(district).push({ name: tu, annualTarget: target });
}

const districts = [...byDistrict.entries()]
  .sort((a, b) => a[0].localeCompare(b[0]))
  .map(([name, tus]) => ({
    name,
    tuCount: tus.length,
    annualTarget: tus.reduce((s, t) => s + (t.annualTarget || 0), 0),
    tus: tus.sort((a, b) => a.name.localeCompare(b.name)),
  }));

const payload = {
  year,
  source: path.basename(src),
  totalDistricts: districts.length,
  totalTus: districts.reduce((s, d) => s + d.tuCount, 0),
  totalAnnualTarget: districts.reduce((s, d) => s + d.annualTarget, 0),
  districts,
};

const outDir = path.join(__dirname, '..', 'data', 'tu-directory');
fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, `${year}.json`);
fs.writeFileSync(outFile, JSON.stringify(payload));

console.log({
  year,
  districts: payload.totalDistricts,
  tus: payload.totalTus,
  annualTarget: payload.totalAnnualTarget,
  out: outFile,
});
