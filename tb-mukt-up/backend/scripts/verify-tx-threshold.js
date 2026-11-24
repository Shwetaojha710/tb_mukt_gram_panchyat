const {
  computeIndicators,
  TREATMENT_SUCCESS_MIN_PCT,
} = require('../src/utils/calculations');

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const base = {
  gpPopulation: 1000,
  testedNaat: 30, // rate = 30
  tbDiagnosed: 0, // detection = 0
  poshanEligible: 1,
  poshanConsented: 1,
  poshanReceived: 1,
};

const cases = [
  { pct: 100, expect: true },
  { pct: 95, expect: true },
  { pct: 92, expect: true },
  { pct: 91.99, expect: false },
  { pct: 91, expect: false },
  { pct: 66, expect: false },
  { pct: 0, expect: false },
  { pct: null, expect: false },
];

console.log('TREATMENT_SUCCESS_MIN_PCT =', TREATMENT_SUCCESS_MIN_PCT);
for (const c of cases) {
  const r = computeIndicators({ ...base, treatmentSuccessPct: c.pct });
  assert(r.indicator3 === c.expect, `pct=${c.pct}: indicator3 expected ${c.expect}, got ${r.indicator3}`);
  assert(r.qualified === c.expect, `pct=${c.pct}: qualified expected ${c.expect}, got ${r.qualified}`);
  console.log(' OK', c.pct, '→ indicator3', r.indicator3);
}

// Current-year diagnoses must not flip Tx criterion by themselves
const highDiagnosed = computeIndicators({
  ...base,
  tbDiagnosed: 5,
  treatmentSuccessPct: 66,
});
assert(highDiagnosed.indicator3 === false, 'current-year cases must not pass Tx at 66%');
assert(highDiagnosed.indicator2 === false, 'detection with 5/1000 should fail indicator2');

console.log('All threshold checks passed');
