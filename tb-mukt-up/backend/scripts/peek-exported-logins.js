const path = require('path');
const ExcelJS = require('exceljs');

(async () => {
  const p = path.join(__dirname, '..', '..', 'exports', 'All_District_and_TU_Logins_2026-10-21.xlsx');
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(p);
  const d = wb.getWorksheet('District Logins');
  const t = wb.getWorksheet('TB Unit Logins');
  const s = wb.getWorksheet('Summary');
  console.log('Summary:');
  s.eachRow((row, n) => {
    if (n > 1) console.log(' ', row.getCell(1).value, '=', row.getCell(2).value);
  });
  console.log('\nSample districts:');
  for (let i = 2; i <= 6; i++) {
    const r = d.getRow(i);
    console.log({
      district: r.getCell(2).value,
      login: r.getCell(5).value,
      pass: r.getCell(6).value,
    });
  }
  console.log('\nSample TUs:');
  for (let i = 2; i <= 6; i++) {
    const r = t.getRow(i);
    console.log({
      district: r.getCell(2).value,
      facility: r.getCell(4).value,
      login: r.getCell(7).value,
      pass: r.getCell(8).value,
      status: r.getCell(1).value,
    });
  }
  // Hardoi district
  for (let i = 2; i <= d.rowCount; i++) {
    if (String(d.getRow(i).getCell(2).value).toLowerCase() === 'hardoi') {
      console.log('\nHardoi district:', {
        login: d.getRow(i).getCell(5).value,
        pass: d.getRow(i).getCell(6).value,
      });
      break;
    }
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
