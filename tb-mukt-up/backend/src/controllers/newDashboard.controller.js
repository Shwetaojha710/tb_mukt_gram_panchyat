const newDashboardService = require('../services/newDashboard.service');

async function summary(req, res, next) {
  try {
    const data = await newDashboardService.getSummary(req.user, req.query);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

async function drilldown(req, res, next) {
  try {
    const data = await newDashboardService.getDrilldown(req.user, req.query);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

async function actions(req, res, next) {
  try {
    const data = await newDashboardService.getActions(req.user, req.query);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

async function exportExcel(req, res, next) {
  try {
    const buffer = await newDashboardService.exportWorkbook(req.user, req.query);
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader('Content-Disposition', 'attachment; filename="tb-mukt-new-dashboard.xlsx"');
    res.send(Buffer.from(buffer));
  } catch (err) {
    next(err);
  }
}

module.exports = { summary, drilldown, actions, exportExcel };
