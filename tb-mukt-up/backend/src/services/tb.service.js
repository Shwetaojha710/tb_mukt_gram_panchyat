const { query } = require('../config/db');
const { AppError } = require('../middleware/errorHandler');
const { computeIndicators, nextMedal } = require('../utils/calculations');
const locationService = require('./location.service');
const { canAccessLocation } = require('../middleware/auth');
const settingsService = require('./settings.service');
function validateNumbers(body) {
  const fields = [
    'testedNaat',
    'tbDiagnosed',
    'prevYearSuccessTreatment',
    'poshanEligible',
    'poshanConsented',
    'poshanReceived',
    'gpPopulation',
  ];
  for (const f of fields) {
    if (body[f] == null) continue;
    if (!Number.isFinite(Number(body[f])) || Number(body[f]) < 0) {
      throw new AppError(`${f} must be a non-negative number`, 400);
    }
  }
  if (Number(body.tbDiagnosed) > Number(body.testedNaat)) {
    throw new AppError('TB cases diagnosed cannot exceed individuals tested', 400);
  }
  if (Number(body.poshanEligible) > Number(body.tbDiagnosed)) {
    throw new AppError(
      'Eligible for Poshan Potli cannot be more than TB cases diagnosed against tested',
      400
    );
  }
  if (Number(body.poshanConsented) > Number(body.poshanEligible)) {
    throw new AppError('Consented cannot be more than Eligible for Poshan Potli', 400);
  }
  if (Number(body.poshanReceived) > Number(body.poshanConsented)) {
    throw new AppError(
      'TB patients received Poshan Potli cannot be more than Consented',
      400
    );
  }
}

async function saveEntry(user, body, status) {
  // Tehsil list is sourced from dbo.Block — keep IDs aligned
  body.blockId = body.blockId || body.tehsilId;
  body.tehsilId = body.tehsilId || body.blockId;

  validateNumbers(body);
  if (!body.districtId || !body.blockId || !body.gpId) {
    throw new AppError('District, Tehsil and Gram Panchayat are required', 400);
  }
  if (!canAccessLocation(user, body)) {
    throw new AppError(
      `Access denied for selected geography (role=${user.role}, userDistrict=${user.districtId || '-'}, selectedDistrict=${body.districtId || '-'})`,
      403
    );
  }

  const ctx = await locationService.getContextBundle(body);
  const gpPopulation = Number(body.gpPopulation ?? ctx.gpPopulation ?? 0);
  const treatmentSuccessPct =
    body.treatmentSuccessPct != null
      ? Number(body.treatmentSuccessPct)
      : gpPopulation
        ? null
        : null;

  // Spec: previous-year TB cases successfully completing treatment — treat input as count;
  // if client sends percentage use it; else if previousYearCases provided compute %.
  let txPct = treatmentSuccessPct;
  if (txPct == null && body.previousYearCases) {
    const den = Number(body.previousYearCases);
    txPct = den > 0 ? (Number(body.prevYearSuccessTreatment) / den) * 100 : 0;
  }
  if (txPct == null) {
    // Interpret prevYearSuccessTreatment as percentage when previousYearCases absent
    txPct = Number(body.prevYearSuccessTreatment);
  }

  const calcs = computeIndicators({
    gpPopulation,
    testedNaat: body.testedNaat,
    tbDiagnosed: body.tbDiagnosed,
    treatmentSuccessPct: txPct,
    poshanEligible: body.poshanEligible,
    poshanConsented: body.poshanConsented,
    poshanReceived: body.poshanReceived,
  });

  const existing = await query(
    `SELECT id, status FROM dbo.tb_mukt_entries WHERE gp_id = @gpId AND reporting_month = @month AND reporting_year = @year`,
    { gpId: body.gpId, month: body.reportingMonth, year: body.reportingYear }
  );
  const existingRow = existing.recordset[0] || null;
  const existingStatus = existingRow ? existingRow.status : null;
  
  await settingsService.enforceEntryWindow(user, body, status, existingStatus);
  
  const params = {
    stateId: body.stateId || user.stateId || null,
    divisionId: body.divisionId || user.divisionId || null,
    districtId: body.districtId,
    districtCode: ctx.districtCode,
    districtName: ctx.districtName,
    tehsilId: body.tehsilId || null,
    blockId: body.blockId,
    blockCode: ctx.blockCode,
    blockName: ctx.blockName,
    gpId: body.gpId,
    gpCode: ctx.gpCode,
    gpName: ctx.gpName,
    gpPopulation,
    villageId: body.villageId || null,
    villageCode: ctx.villageCode,
    villageName: ctx.villageName,
    villagePopulation: ctx.villagePopulation,
    tbUnitId: ctx.tbUnitId,
    tbUnitName: ctx.tbUnitCode
      ? `${ctx.tbUnitCode} / ${ctx.tbUnitName || ''}`.trim()
      : ctx.tbUnitName,
    reportingMonth: body.reportingMonth,
    reportingYear: body.reportingYear,
    testedNaat: body.testedNaat,
    tbDiagnosed: body.tbDiagnosed,
    prevYearSuccessTreatment: body.prevYearSuccessTreatment,
    treatmentSuccessPct: calcs.treatmentSuccessPct,
    poshanEligible: body.poshanEligible,
    poshanConsented: body.poshanConsented,
    poshanReceived: body.poshanReceived,
    testingRate: calcs.testingRate,
    detectionRate: calcs.detectionRate,
    poshanPct: calcs.poshanPct,
    indicator1: calcs.indicator1 ? 1 : 0,
    indicator2: calcs.indicator2 ? 1 : 0,
    indicator3: calcs.indicator3 ? 1 : 0,
    indicator4: calcs.indicator4 ? 1 : 0,
    isQualified: calcs.qualified ? 1 : 0,
    overallTarget: calcs.overallTarget,
    testingPending: calcs.testingPending,
    poshanPending: calcs.poshanPending,
    status,
    userId: user.userId,
  };

  let entryId;
  if (existing.recordset.length) {
    entryId = existing.recordset[0].id;
    const requestedId = body.entryId ? Number(body.entryId) : null;
    if (!requestedId || requestedId !== Number(entryId)) {
      const monthYear = `${body.reportingMonth}/${body.reportingYear}`;
      throw new AppError(
        `An entry already exists for this Gram Panchayat for ${monthYear}. Duplicate entries are not allowed.`,
        409
      );
    }
    await query(
      `
        UPDATE dbo.tb_mukt_entries SET
          state_id=@stateId, division_id=@divisionId, district_id=@districtId,
          district_code=@districtCode, district_name=@districtName, tehsil_id=@tehsilId,
          block_id=@blockId, block_code=@blockCode, block_name=@blockName,
          gp_code=@gpCode, gp_name=@gpName, gp_population=@gpPopulation,
          village_id=@villageId, village_code=@villageCode, village_name=@villageName,
          village_population=@villagePopulation, tb_unit_id=@tbUnitId, tb_unit_name=@tbUnitName,
          tested_naat=@testedNaat, tb_diagnosed=@tbDiagnosed,
          prev_year_success_treatment=@prevYearSuccessTreatment,
          treatment_success_pct=@treatmentSuccessPct,
          poshan_eligible=@poshanEligible, poshan_consented=@poshanConsented, poshan_received=@poshanReceived,
          testing_rate=@testingRate, detection_rate=@detectionRate, poshan_pct=@poshanPct,
          indicator1=@indicator1, indicator2=@indicator2, indicator3=@indicator3, indicator4=@indicator4,
          is_qualified=@isQualified, overall_target=@overallTarget,
          testing_pending=@testingPending, poshan_pending=@poshanPending,
          status=@status, updated_by=@userId, updated_at=SYSUTCDATETIME()
        WHERE id=@id
        `,
      { ...params, id: entryId }
    );
  } else {
    if (body.entryId) {
      throw new AppError('Entry not found for update', 404);
    }
    const inserted = await query(
      `
      INSERT INTO dbo.tb_mukt_entries (
        state_id, division_id, district_id, district_code, district_name, tehsil_id,
        block_id, block_code, block_name, gp_id, gp_code, gp_name, gp_population,
        village_id, village_code, village_name, village_population, tb_unit_id, tb_unit_name,
        reporting_month, reporting_year, tested_naat, tb_diagnosed, prev_year_success_treatment,
        treatment_success_pct, poshan_eligible, poshan_consented, poshan_received, testing_rate, detection_rate,
        poshan_pct, indicator1, indicator2, indicator3, indicator4, is_qualified,
        overall_target, testing_pending, poshan_pending, status, created_by, updated_by
      )
      OUTPUT INSERTED.id
      VALUES (
        @stateId, @divisionId, @districtId, @districtCode, @districtName, @tehsilId,
        @blockId, @blockCode, @blockName, @gpId, @gpCode, @gpName, @gpPopulation,
        @villageId, @villageCode, @villageName, @villagePopulation, @tbUnitId, @tbUnitName,
        @reportingMonth, @reportingYear, @testedNaat, @tbDiagnosed, @prevYearSuccessTreatment,
        @treatmentSuccessPct, @poshanEligible, @poshanConsented, @poshanReceived, @testingRate, @detectionRate,
        @poshanPct, @indicator1, @indicator2, @indicator3, @indicator4, @isQualified,
        @overallTarget, @testingPending, @poshanPending, @status, @userId, @userId
      )
      `,
      params
    );
    entryId = inserted.recordset[0].id;
  }

  if (status === 'SUBMITTED') {
    await upsertYearlyQualification(body.gpId, body.reportingYear, calcs.qualified, ctx, body);
  }

  const saved = await query(`SELECT * FROM dbo.tb_mukt_entries WHERE id = @id`, { id: entryId });
  return { entry: mapEntry(saved.recordset[0]), calculations: calcs };
}

async function upsertYearlyQualification(gpId, year, qualified, ctx, body) {
  const prevYear = Number(year) - 1;
  const prev = await query(
    `SELECT TOP 1 medal, qualified FROM dbo.tb_mukt_qualification_history WHERE gp_id=@gpId AND year=@year`,
    { gpId, year: prevYear }
  );
  const previousStatus = prev.recordset[0]?.medal || 'NONE';
  const medal = nextMedal(previousStatus, qualified);
  const consecutive =
    qualified && previousStatus !== 'NONE' && previousStatus !== 'NOT_QUALIFIED'
      ? (prev.recordset[0] ? (medal === 'GOLD' ? 3 : medal === 'SILVER' ? 2 : 1) : 1)
      : qualified
        ? 1
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
      gpId,
      year,
      qualified: qualified ? 1 : 0,
      medal: qualified ? medal : 'NOT_QUALIFIED',
      prevStatus: previousStatus,
      consecutive,
      gpName: ctx.gpName,
      districtId: body.districtId,
      blockId: body.blockId,
    }
  );
}

function mapEntry(row) {
  if (!row) return null;
  return {
    id: row.id,
    stateId: row.state_id,
    divisionId: row.division_id,
    districtId: row.district_id,
    districtCode: row.district_code,
    districtName: row.district_name,
    tehsilId: row.tehsil_id,
    blockId: row.block_id,
    blockCode: row.block_code,
    blockName: row.block_name,
    gpId: row.gp_id,
    gpCode: row.gp_code,
    gpName: row.gp_name,
    gpPopulation: row.gp_population,
    villageId: row.village_id,
    villageCode: row.village_code,
    villageName: row.village_name,
    villagePopulation: row.village_population,
    tbUnitId: row.tb_unit_id,
    tbUnitName: row.tb_unit_name,
    reportingMonth: row.reporting_month,
    reportingYear: row.reporting_year,
    testedNaat: row.tested_naat,
    tbDiagnosed: row.tb_diagnosed,
    prevYearSuccessTreatment: row.prev_year_success_treatment,
    treatmentSuccessPct: row.treatment_success_pct,
    poshanEligible: row.poshan_eligible,
    poshanConsented: row.poshan_consented ?? row.poshan_eligible,
    poshanReceived: row.poshan_received,
    testingRate: row.testing_rate,
    detectionRate: row.detection_rate,
    poshanPct: row.poshan_pct,
    indicator1: !!row.indicator1,
    indicator2: !!row.indicator2,
    indicator3: !!row.indicator3,
    indicator4: !!row.indicator4,
    isQualified: !!row.is_qualified,
    overallTarget: row.overall_target,
    testingPending: row.testing_pending,
    poshanPending: row.poshan_pending,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Attach master-settings based edit/submit flags for list UI */
function withEditFlags(entry, settings, user) {
  if (!entry) return entry;

  const { submitDeadline, editDeadline } = settingsService.getDeadlines(
    settings,
    entry.reportingYear,
    entry.reportingMonth
  );

  const now = new Date();
  const isState = String(user?.role || '').toUpperCase() === 'STATE';

  let canEdit = false;
  if (isState) {
    canEdit = true;
  } else if (entry.status === 'DRAFT') {
    canEdit = now <= submitDeadline;
  } else if (entry.status === 'SUBMITTED') {
    canEdit = now <= editDeadline;
  }

  return {
    ...entry,
    canEdit,
    editUntil: editDeadline.toISOString(),
    submitUntil: submitDeadline.toISOString(),
    editDeadlineDay: settings.editDeadlineDay,
    submitDeadlineDay: settings.submitDeadlineDay,
  };
}

async function getEntry(user, { gpId, month, year }) {
  const result = await query(
    `SELECT * FROM dbo.tb_mukt_entries WHERE gp_id=@gpId AND reporting_month=@month AND reporting_year=@year`,
    { gpId, month, year }
  );
  const entry = result.recordset[0];
  if (!entry) return null;
  if (!canAccessLocation(user, { gpId: entry.gp_id, blockId: entry.block_id, districtId: entry.district_id })) {
    throw new AppError('Access denied', 403);
  }
  return mapEntry(entry);
}

async function listEntries(user, filters = {}) {
  const where = ['1=1'];
  const params = {};

  if (user.role === 'DIVISION' && user.divisionId) {
    where.push('e.division_id = @scopeDivisionId');
    params.scopeDivisionId = user.divisionId;
  }
  if (user.role === 'DISTRICT' && user.districtId) {
    where.push('e.district_id = @scopeDistrictId');
    params.scopeDistrictId = user.districtId;
  }
  if ((user.role === 'TEHSIL' || user.role === 'BLOCK') && (user.blockId || user.tehsilId)) {
    where.push('e.block_id = @scopeBlockId');
    params.scopeBlockId = user.blockId || user.tehsilId;
  }
  if ((user.role === 'GP' || user.role === 'VILLAGE') && user.gpId) {
    where.push('e.gp_id = @scopeGpId');
    params.scopeGpId = user.gpId;
  }

  if (filters.districtId) {
    where.push('e.district_id = @districtId');
    params.districtId = Number(filters.districtId);
  }
  if (filters.blockId || filters.tehsilId) {
    where.push('e.block_id = @blockId');
    params.blockId = Number(filters.blockId || filters.tehsilId);
  }
  if (filters.gpId) {
    where.push('e.gp_id = @gpId');
    params.gpId = Number(filters.gpId);
  }
  if (filters.year) {
    where.push('e.reporting_year = @year');
    params.year = Number(filters.year);
  }
  if (filters.month) {
    where.push('e.reporting_month = @month');
    params.month = Number(filters.month);
  }
  if (filters.status) {
    where.push('e.status = @status');
    params.status = String(filters.status).toUpperCase();
  }

  const page = Math.max(1, Number(filters.page) || 1);
  const pageSize = Math.min(100, Math.max(10, Number(filters.pageSize) || 20));
  const offset = (page - 1) * pageSize;
  params.offset = offset;
  params.pageSize = pageSize;

  const countRes = await query(
    `SELECT COUNT(*) AS total FROM dbo.tb_mukt_entries e WHERE ${where.join(' AND ')}`,
    params
  );

  const result = await query(
    `
    SELECT e.*
    FROM dbo.tb_mukt_entries e
    WHERE ${where.join(' AND ')}
    ORDER BY e.reporting_year DESC, e.reporting_month DESC, e.updated_at DESC
    OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY
    `,
    params
  );

  const settings = await settingsService.getEntrySettings();

  return {
    items: result.recordset
      .map(mapEntry)
      .map((entry) => withEditFlags(entry, settings, user)),
    total: countRes.recordset[0].total,
    page,
    pageSize,
    settings: {
      reportingMonthsBack: settings.reportingMonthsBack,
      submitDeadlineDay: settings.submitDeadlineDay,
      editDeadlineDay: settings.editDeadlineDay,
    },
  };
}

module.exports = { saveEntry, getEntry, listEntries, mapEntry, validateNumbers, withEditFlags };
