const dashboardService = require('../services/dashboard.service');

async function summary(req, res, next) {
  try {
    const data = await dashboardService.getSummary(req.user, req.query);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

async function rankings(req, res, next) {
  try {
    const data = await dashboardService.getRankings(req.user, req.query);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

async function periods(req, res, next) {
  try {
    const data = await dashboardService.getAvailablePeriods(req.user);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

async function exportExcel(req, res, next) {
  try {
    const buffer = await dashboardService.exportWorkbook(req.user, req.query);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="tb-mukt-dashboard.xlsx"');
    res.send(Buffer.from(buffer));
  } catch (err) {
    next(err);
  }
}

module.exports = { summary, rankings, periods, exportExcel };
