const { query } = require('../config/db');
const { AppError } = require('../middleware/errorHandler');

const DEFAULTS = {
  reportingMonthsBack: 6,
  submitDeadlineDay: 10,
  editDeadlineDay: 15,
};

function mapRow(row) {
  if (!row) return { ...DEFAULTS };
  return {
    id: row.id,
    reportingMonthsBack: Number(row.reporting_months_back),
    submitDeadlineDay: Number(row.submit_deadline_day),
    editDeadlineDay: Number(row.edit_deadline_day),
    updatedAt: row.updated_at,
  };
}

async function getEntrySettings() {
  const res = await query(`
    SELECT TOP 1 id, reporting_months_back, submit_deadline_day, edit_deadline_day, updated_at
    FROM dbo.tb_mukt_entry_settings
    ORDER BY id
  `);
  return mapRow(res.recordset[0]);
}

async function updateEntrySettings(user, body) {
  if (String(user.role || '').toUpperCase() !== 'STATE') {
    throw new AppError('Only State admin can update TB entry settings', 403);
  }

  const reportingMonthsBack = Number(body.reportingMonthsBack);
  const submitDeadlineDay = Number(body.submitDeadlineDay);
  const editDeadlineDay = Number(body.editDeadlineDay);

  if (editDeadlineDay < submitDeadlineDay) {
    throw new AppError('Edit deadline day must be >= submit deadline day', 400);
  }

  const existing = await query(`SELECT TOP 1 id FROM dbo.tb_mukt_entry_settings ORDER BY id`);
  if (!existing.recordset[0]) {
    await query(
      `INSERT INTO dbo.tb_mukt_entry_settings
        (reporting_months_back, submit_deadline_day, edit_deadline_day, updated_by)
       VALUES (@reportingMonthsBack, @submitDeadlineDay, @editDeadlineDay, @userId)`,
      { reportingMonthsBack, submitDeadlineDay, editDeadlineDay, userId: user.userId || null }
    );
  } else {
    await query(
      `UPDATE dbo.tb_mukt_entry_settings
       SET reporting_months_back = @reportingMonthsBack,
           submit_deadline_day = @submitDeadlineDay,
           edit_deadline_day = @editDeadlineDay,
           updated_by = @userId,
           updated_at = SYSUTCDATETIME()
       WHERE id = @id`,
      {
        id: existing.recordset[0].id,
        reportingMonthsBack,
        submitDeadlineDay,
        editDeadlineDay,
        userId: user.userId || null,
      }
    );
  }

  return getEntrySettings();
}

/** Last N completed months (exclude current month) */
function buildAllowedPeriods(reportingMonthsBack, now = new Date()) {
  const n = Number(reportingMonthsBack) || 6;
  const periods = [];
  let y = now.getFullYear();
  let m = now.getMonth(); // 0-based current
  for (let i = 0; i < n; i++) {
    m -= 1;
    if (m < 0) {
      m = 11;
      y -= 1;
    }
    periods.push({ year: y, month: m + 1 });
  }
  return periods;
}

function endOfDay(year, month /* 1-12 */, day) {
  return new Date(year, month - 1, day, 23, 59, 59, 999);
}

function nextMonthYear(year, month) {
  let m = month + 1;
  let y = year;
  if (m > 12) {
    m = 1;
    y += 1;
  }
  return { year: y, month: m };
}

function getDeadlines(settings, reportingYear, reportingMonth) {
  const next = nextMonthYear(Number(reportingYear), Number(reportingMonth));
  return {
    submitDeadline: endOfDay(next.year, next.month, settings.submitDeadlineDay),
    editDeadline: endOfDay(next.year, next.month, settings.editDeadlineDay),
  };
}

function isStateAdmin(user) {
  return String(user?.role || '').toUpperCase() === 'STATE';
}

async function enforceEntryWindow(user, body, status, existingStatus) {
  // State admin can bypass deadlines (optional — remove if not wanted)
  if (isStateAdmin(user)) return;

  const settings = await getEntrySettings();
  const year = Number(body.reportingYear);
  const month = Number(body.reportingMonth);

  const allowed = buildAllowedPeriods(settings.reportingMonthsBack);
  const periodOk = allowed.some((p) => p.year === year && p.month === month);
  if (!periodOk) {
    throw new AppError(
      `Only last ${settings.reportingMonthsBack} completed months are allowed`,
      400
    );
  }

  const now = new Date();
  const { submitDeadline, editDeadline } = getDeadlines(settings, year, month);

  // Updating an already submitted entry → edit window
  if (existingStatus === 'SUBMITTED') {
    if (now > editDeadline) {
      throw new AppError(
        `Edit closed for this reporting month (allowed until ${editDeadline.toLocaleDateString('en-IN')})`,
        400
      );
    }
    return;
  }

  // New / draft / submit → submit window
  if (status === 'SUBMITTED' && now > submitDeadline) {
    throw new AppError(
      `Submission closed for this reporting month (allowed until ${submitDeadline.toLocaleDateString('en-IN')})`,
      400
    );
  }
}

module.exports = {
  getEntrySettings,
  updateEntrySettings,
  buildAllowedPeriods,
  getDeadlines,
  enforceEntryWindow,
};