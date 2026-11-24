/**
 * Repair tb_mukt_qualification_history medals after threshold recalc.
 * Processes each GP's years in ascending order so consecutive medals stay consistent.
 */
require('dotenv').config();
const { query } = require('../src/config/db');
const { nextMedal } = require('../src/utils/calculations');

(async () => {
  const yearly = await query(`
    SELECT
      e.gp_id AS gpId,
      e.reporting_year AS year,
      MAX(e.gp_name) AS gpName,
      MAX(e.district_id) AS districtId,
      MAX(e.block_id) AS blockId,
      MAX(CASE WHEN e.is_qualified = 1 THEN 1 ELSE 0 END) AS qualified
    FROM dbo.tb_mukt_entries e
    WHERE e.status = 'SUBMITTED'
    GROUP BY e.gp_id, e.reporting_year
    ORDER BY e.gp_id, e.reporting_year
  `);

  let updated = 0;
  let lastGp = null;
  let prevMedal = 'NONE';

  for (const row of yearly.recordset) {
    if (row.gpId !== lastGp) {
      lastGp = row.gpId;
      prevMedal = 'NONE';
      // Seed from history for year-1 if present (handles GPs with gaps)
      const seed = await query(
        `SELECT TOP 1 medal FROM dbo.tb_mukt_qualification_history WHERE gp_id=@gpId AND year=@year`,
        { gpId: row.gpId, year: Number(row.year) - 1 }
      );
      if (seed.recordset[0]?.medal) prevMedal = seed.recordset[0].medal;
    }

    const qualified = !!row.qualified;
    const medal = qualified ? nextMedal(prevMedal, true) : 'NOT_QUALIFIED';
    const consecutive = qualified
      ? prevMedal !== 'NONE' && prevMedal !== 'NOT_QUALIFIED'
        ? medal === 'GOLD'
          ? 3
          : medal === 'SILVER'
            ? 2
            : 1
        : 1
      : 0;

    await query(
      `
      MERGE dbo.tb_mukt_qualification_history AS t
      USING (SELECT @gpId AS gp_id, @year AS year) AS s
      ON t.gp_id = s.gp_id AND t.year = s.year
      WHEN MATCHED THEN UPDATE SET
        qualified=@qualified, medal=@medal, previous_year_status=@prevStatus,
        consecutive_years=@consecutive, gp_name=@gpName, district_id=@districtId,
        block_id=@blockId, updated_at=SYSUTCDATETIME()
      WHEN NOT MATCHED THEN INSERT
        (gp_id, gp_name, district_id, block_id, year, qualified, medal, previous_year_status, consecutive_years)
      VALUES
        (@gpId, @gpName, @districtId, @blockId, @year, @qualified, @medal, @prevStatus, @consecutive);
      `,
      {
        gpId: row.gpId,
        year: row.year,
        qualified: qualified ? 1 : 0,
        medal,
        prevStatus: prevMedal,
        consecutive,
        gpName: row.gpName,
        districtId: row.districtId,
        blockId: row.blockId,
      }
    );

    prevMedal = qualified ? medal : 'NOT_QUALIFIED';
    updated += 1;
  }

  console.log({ yearsRepaired: updated });
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
