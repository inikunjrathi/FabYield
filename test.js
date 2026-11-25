// node test.js
const assert = require('assert');
const { compute, validate, EXAMPLE } = require('./engine.js');
const near = (a, b, tol = 0.005, msg) => assert(Math.abs(a - b) <= tol, `${msg || ''} expected ${b}, got ${a}`);
const clone = () => JSON.parse(JSON.stringify(EXAMPLE));

function invariants(d, label) {
  const r = compute(d);
  for (const s of r.stages) {
    near(s.drTotal, s.crTotal, 0.01, `${label} ${s.name} account balances (₹)`);
    near(s.drUnits, s.crUnits, 1e-6, `${label} ${s.name} account balances (units)`);
    for (const k of ['normalLedger', 'lossLedger', 'gainLedger']) {
      const sum = side => s[k][side].reduce((t, x) => t + x.amt, 0);
      near(sum('dr'), sum('cr'), 0.01, `${label} ${s.name} ${k} balances`);
    }
  }
  near(r.waferUsage.byStage.reduce((a, b) => a + b, 0), r.waferUsage.total, 0.01, `${label} stage shares`);
  near(r.variances.total, r.stdCost.total - r.actual.netCost, 0.01, `${label} variances sum to std - actual`);
  near(r.pl.actual.profit - r.pl.standard.profit, r.pl.recon.stockDiff, 0.01, `${label} P&L reconciliation`);
  return r;
}

// 1. Worked example
const r = invariants(clone(), 'example');
assert.deepStrictEqual(r.stages.map(s => s.good), [900, 870, 380000]);
[25000, 30000, 100].forEach((v, i) => near(r.stages[i].cpu, v));
[50, -6, 11500].forEach((v, i) => near(r.stages[i].abnUnits, v, 1e-6));
[1250000, -180000, 1150000].forEach((v, i) => near(r.stages[i].abnValue, v));
near(r.actual.netAbnormal, 2092000);
near(r.actual.allIn, 105.505, 0.001);
near(r.actual.netCost, 40092000);
near(r.waferUsage.total, -1481481.48, 0.01);
near(r.stdCost.perChip, 99.0974659, 1e-6);
near(r.variances.total, -2434963, 1);
near(r.pl.actual.profit, 7808000);
near(r.pl.standard.profit, 7789949, 1);
near(r.pl.recon.stockDiff, 18050.68, 0.01);

// 2. All sold: the two profits are equal
let d = clone(); d.sold = 380000;
let x = invariants(d, 'all sold');
near(x.pl.actual.profit, x.pl.standard.profit);

// 3. Gain in every stage
d = clone(); d.stages[0].actualLoss = 40; d.stages[1].actualLoss = 30; d.stages[2].actualLoss = 40000;
x = invariants(d, 'gain only');
assert(x.stages.every(s => s.abnUnits < 0) && x.actual.netAbnormal < 0);

// 4. Zero loss, actual and normal
d = clone(); d.stages.forEach(s => { s.actualLoss = 0; s.normalPct = 0; });
x = invariants(d, 'zero loss');
near(x.waferUsage.total, 0, 1e-6); near(x.actual.netAbnormal, 0, 1e-6);

// 5. Exactly on standard: no abnormal loss, no variance
d = clone();
d.stages[0].actualLoss = 50; d.stages[1].actualLoss = 38; d.stages[2].actualLoss = 45600;
d.stages[0].matQty = 5000; d.stages[0].matPrice = 240; d.stages[0].labour = 1000000; d.stages[0].overhead = 1500000;
d.stages[1].matQty = 1900; d.stages[1].matPrice = 590; d.stages[1].labour = 1000000; d.stages[1].overhead = 1565000;
d.stages[2].matQty = 456000; d.stages[2].labour = 2384000; d.stages[2].overhead = 4000000;
x = invariants(d, 'on standard');
near(x.actual.netAbnormal, 0, 1e-6); near(x.variances.total, 0, 0.01);

// 6. Validation
assert.deepStrictEqual(validate(clone()), {});
const bad = (path, v) => {
  const b = clone(); const k = path.split('.');
  k.slice(0, -1).reduce((o, p) => o[p], b)[k.at(-1)] = v;
  assert(validate(b)[path], `${path}=${v} should be rejected`);
};
bad('wafers', -1); bad('wafers', 0); bad('wafers', 10.5); bad('waferPrice', NaN); bad('dpw', 0);
bad('stages.0.normalPct', 100); bad('stages.0.actualLoss', 1000); bad('stages.1.actualLoss', 900);
bad('stages.2.actualLoss', 435000); bad('stages.2.actualLoss', 1.5); bad('sold', 380001); bad('price', Infinity);
bad('stages.0.scrap', 1e6);   // scrap worth more than the whole process cost
console.log('all checks pass');
