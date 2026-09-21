const tbService = require('../services/tb.service');
const { validate, tbEntrySchema } = require('../validators');
const locationService = require('../services/location.service');

async function saveDraft(req, res, next) {
  try {
    const data = await tbService.saveEntry(req.user, req.body, 'DRAFT');
    res.json({ success: true, message: 'Draft saved', data });
  } catch (err) {
    next(err);
  }
}

async function submit(req, res, next) {
  try {
    const data = await tbService.saveEntry(req.user, req.body, 'SUBMITTED');
    res.json({ success: true, message: 'Entry submitted', data });
  } catch (err) {
    next(err);
  }
}

async function getOne(req, res, next) {
  try {
    const data = await tbService.getEntry(req.user, {
      gpId: req.query.gpId,
      month: req.query.month,
      year: req.query.year,
    });
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

async function preview(req, res, next) {
  try {
    const { computeIndicators } = require('../utils/calculations');
    const body = {
      ...req.body,
      blockId: req.body.blockId || req.body.tehsilId,
      tehsilId: req.body.tehsilId || req.body.blockId,
    };
    const ctx = await locationService.getContextBundle(body);
    const gpPopulation = Number(body.gpPopulation ?? ctx.gpPopulation ?? 0);
    let txPct = body.treatmentSuccessPct;
    if (txPct == null && body.previousYearCases) {
      const den = Number(body.previousYearCases);
      txPct = den > 0 ? (Number(body.prevYearSuccessTreatment) / den) * 100 : 0;
    }
    if (txPct == null) txPct = Number(body.prevYearSuccessTreatment);
    const calculations = computeIndicators({
      gpPopulation,
      testedNaat: body.testedNaat,
      tbDiagnosed: body.tbDiagnosed,
      treatmentSuccessPct: txPct,
      poshanEligible: body.poshanEligible,
      poshanConsented: body.poshanConsented ?? body.poshanEligible,
      poshanReceived: body.poshanReceived,
    });
    res.json({ success: true, data: { context: ctx, calculations } });
  } catch (err) {
    next(err);
  }
}

async function list(req, res, next) {
  try {
    const data = await tbService.listEntries(req.user, req.query);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  saveDraft,
  submit,
  getOne,
  preview,
  list,
  entryValidators: [validate(tbEntrySchema)],
};
