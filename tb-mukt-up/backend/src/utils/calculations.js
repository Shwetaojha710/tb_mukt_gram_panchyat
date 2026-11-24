/**
 * TB Mukt GP qualification calculations
 *
 * Central thresholds (do not duplicate elsewhere):
 * - Testing rate >= 30 per 1000 population
 * - Detection rate <= 1 per 1000 population
 * - Previous-year treatment success >= 92%
 * - Poshan Potli received = 100% of consented
 */

/** Minimum previous-year treatment success % for indicator 3 (inclusive). */
const TREATMENT_SUCCESS_MIN_PCT = 92;

function safeDiv(num, den) {
  if (!den || Number(den) === 0) return 0;
  return Number(num) / Number(den);
}

function computeIndicators(input) {
  const gpPopulation = Number(input.gpPopulation) || 0;
  const tested = Number(input.testedNaat) || 0;
  const notified = Number(input.tbDiagnosed) || 0;
  // Preserve explicit 0% (e.g. death outcome); only missing/invalid → NaN (fails criterion).
  const rawTx = input.treatmentSuccessPct;
  const treatmentSuccessPct =
    rawTx === null || rawTx === undefined || rawTx === ''
      ? NaN
      : Number(rawTx);
  const eligible = Number(input.poshanEligible) || 0;
  const consented = Number(input.poshanConsented ?? input.poshanEligible) || 0;
  const received = Number(input.poshanReceived) || 0;

  const testingRate = gpPopulation > 0 ? (tested * 1000) / gpPopulation : 0;
  const detectionRate = gpPopulation > 0 ? (notified * 1000) / gpPopulation : 0;
  const poshanPct = consented > 0 ? (received / consented) * 100 : 0;

  const indicator1 = testingRate >= 30;
  const indicator2 = detectionRate <= 1;
  // Previous-year treatment cohort only — current-year diagnosed cases do not enter this %.
  const indicator3 =
    !Number.isNaN(treatmentSuccessPct) && treatmentSuccessPct >= TREATMENT_SUCCESS_MIN_PCT;
  const indicator4 = consented > 0 && Math.abs(poshanPct - 100) < 0.0001;
  const qualified = indicator1 && indicator2 && indicator3 && indicator4;

  const overallTarget = gpPopulation > 0 ? (gpPopulation * 30) / 1000 : 0;
  const testingPending = Math.max(0, overallTarget - tested);
  const poshanPending = Math.max(0, consented - received);

  return {
    testingRate: round(testingRate, 4),
    detectionRate: round(detectionRate, 4),
    treatmentSuccessPct: Number.isNaN(treatmentSuccessPct) ? null : round(treatmentSuccessPct, 2),
    poshanPct: round(poshanPct, 2),
    indicator1,
    indicator2,
    indicator3,
    indicator4,
    qualified,
    overallTarget: round(overallTarget, 2),
    testingPending: round(testingPending, 2),
    poshanPending: round(poshanPending, 2),
  };
}

function round(n, d = 2) {
  const f = 10 ** d;
  return Math.round((Number(n) + Number.EPSILON) * f) / f;
}

/**
 * Consecutive yearly medals:
 * 1st consecutive = Bronze, 2nd = Silver, 3rd+ = Gold
 */
function nextMedal(previousStatus, qualifiedThisYear) {
  if (!qualifiedThisYear) return 'NONE';
  const prev = (previousStatus || 'NONE').toUpperCase();
  if (prev === 'NONE' || prev === 'NOT_QUALIFIED') return 'BRONZE';
  if (prev === 'BRONZE') return 'SILVER';
  if (prev === 'SILVER' || prev === 'GOLD') return 'GOLD';
  return 'BRONZE';
}

function computeTreatmentSuccessPct(successfulCompletions, previousYearCases) {
  if (!previousYearCases || Number(previousYearCases) === 0) {
    // If only success count is provided as percentage already, caller should pass treatmentSuccessPct
    return null;
  }
  return safeDiv(successfulCompletions, previousYearCases) * 100;
}

module.exports = {
  TREATMENT_SUCCESS_MIN_PCT,
  computeIndicators,
  nextMedal,
  computeTreatmentSuccessPct,
  safeDiv,
  round,
};
