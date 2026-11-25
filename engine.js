// FabYield costing engine. Pure functions, no DOM. Money in rupees, unrounded until display.
// Sign rule for variances: positive = favourable.
(function (root) {
  'use strict';

  // Illustrative data, not a real fab.
  const EXAMPLE = {
    wafers: 1000, waferPrice: 20000, stdWaferPrice: 20000, dpw: 500,
    sold: 360000, price: 140, sga: 4500000,
    stages: [
      { name: 'Etching', unit: 'wafers', matUnit: 'L', matOne: 'L', matName: 'Etch chemicals',
        matQty: 5200, matPrice: 250, labour: 950000, overhead: 1600000,
        normalPct: 5, scrap: 2000, actualLoss: 100, stdMatQty: 5, stdMatPrice: 240, stdConv: 2500 },
      { name: 'Doping', unit: 'wafers', matUnit: 'kg', matOne: 'kg', matName: 'Dopant',
        matQty: 1840, matPrice: 600, labour: 824000, overhead: 1600000,
        normalPct: 4, scrap: 3000, actualLoss: 30, stdMatQty: 2, stdMatPrice: 590, stdConv: 2700 },
      { name: 'Packaging', unit: 'die', matUnit: 'sets', matOne: 'set', matName: 'Package sets',
        matQty: 441000, matPrice: 16, labour: 2468000, overhead: 3700000,
        normalPct: 10, scrap: 4, actualLoss: 55000, stdMatQty: 1, stdMatPrice: 16, stdConv: 14 },
    ],
  };

  const sum = (a, f) => a.reduce((t, x, i) => t + f(x, i), 0);

  // Returns { 'path': 'message' }; empty object means valid.
  function validate(d) {
    const e = {};
    const num = (path, v) => {
      if (typeof v !== 'number' || !Number.isFinite(v)) e[path] = 'Enter a number.';
      else if (v < 0) e[path] = 'Cannot be negative.';
    };
    const whole = (path, v) => { num(path, v); if (!e[path] && !Number.isInteger(v)) e[path] = 'Enter a whole number.'; };
    for (const k of ['waferPrice', 'stdWaferPrice', 'price', 'sga']) num(k, d[k]);
    for (const k of ['wafers', 'dpw']) { whole(k, d[k]); if (!e[k] && d[k] < 1) e[k] = 'Must be at least 1.'; }
    whole('sold', d.sold);

    d.stages.forEach((s, i) => {
      const p = `stages.${i}.`;
      for (const k of ['matQty', 'matPrice', 'labour', 'overhead', 'normalPct', 'scrap', 'stdMatQty', 'stdMatPrice', 'stdConv']) num(p + k, s[k]);
      whole(p + 'actualLoss', s.actualLoss);
      if (!e[p + 'normalPct'] && s.normalPct >= 100) e[p + 'normalPct'] = 'Must be below 100%.';
    });
    if (Object.keys(e).length) return e;

    let input = d.wafers, cost = d.wafers * d.waferPrice;
    for (let i = 0; i < d.stages.length; i++) {
      const s = d.stages[i], p = `stages.${i}.`;
      if (s.unit === 'die') input *= d.dpw;
      if (s.actualLoss >= input) { e[p + 'actualLoss'] = `Must be below the ${input} ${s.unit} put into this stage.`; return e; }
      const D = cost + s.matQty * s.matPrice + s.labour + s.overhead;
      const nl = input * s.normalPct / 100;
      if (nl * s.scrap > D) { e[p + 'scrap'] = 'Scrap value of normal loss exceeds the whole process cost.'; return e; }
      input -= s.actualLoss;
      cost = input * (D - nl * s.scrap) / (input + s.actualLoss - nl);
    }
    if (d.sold > input) e.sold = `Only ${input} good chips were produced.`;
    return e;
  }

  function compute(d) {
    // 1. Process accounts
    let input = d.wafers, inCost = d.wafers * d.waferPrice;
    const stages = d.stages.map((s, i) => {
      if (s.unit === 'die') input *= d.dpw;
      const material = s.matQty * s.matPrice;
      const D = inCost + material + s.labour + s.overhead;
      const normalUnits = input * s.normalPct / 100;
      const normalScrap = normalUnits * s.scrap;
      const expected = input - normalUnits;
      const cpu = (D - normalScrap) / expected;
      const good = input - s.actualLoss;
      const abnUnits = expected - good;            // + loss, - gain
      const abnValue = abnUnits * cpu;
      const abnScrap = abnUnits * s.scrap;         // + recovered, - forgone
      const outValue = good * cpu;
      const loss = Math.max(abnUnits, 0), gain = Math.max(-abnUnits, 0);
      const r = {
        i, name: s.name, unit: s.unit, matName: s.matName, scrap: s.scrap, normalPct: s.normalPct,
        input, inCost, material, labour: s.labour, overhead: s.overhead, D,
        normalUnits, normalScrap, expected, cpu, actualLoss: s.actualLoss, good,
        abnUnits, abnValue, abnScrap, abnNet: abnValue - abnScrap, loss, gain, outValue,
        yieldStd: 1 - s.normalPct / 100, yieldAct: good / input,
        drTotal: D + gain * cpu, crTotal: normalScrap + loss * cpu + outValue,
        drUnits: input + gain, crUnits: normalUnits + loss + good,
        // Ledgers. Cash is for units actually scrapped.
        normalLedger: {
          dr: [{ t: `${s.name} process`, u: normalUnits, amt: normalScrap }],
          cr: [{ t: 'Cash (scrap sold)', u: normalUnits - gain, amt: (normalUnits - gain) * s.scrap },
               ...(gain ? [{ t: 'Abnormal gain (scrap forgone)', u: gain, amt: gain * s.scrap }] : [])],
        },
        lossLedger: {
          dr: loss ? [{ t: `${s.name} process`, u: loss, amt: loss * cpu }] : [],
          cr: loss ? [{ t: 'Cash (scrap sold)', u: loss, amt: loss * s.scrap }, { t: 'Profit and loss', u: null, amt: loss * (cpu - s.scrap) }] : [],
        },
        gainLedger: {
          dr: gain ? [{ t: 'Normal loss (scrap forgone)', u: gain, amt: gain * s.scrap }, { t: 'Profit and loss', u: null, amt: gain * (cpu - s.scrap) }] : [],
          cr: gain ? [{ t: `${s.name} process`, u: gain, amt: gain * cpu }] : [],
        },
      };
      input = good; inCost = outValue;
      return r;
    });

    const last = stages[stages.length - 1];
    const G = last.good;
    const scrapCash = sum(stages, s => s.actualLoss * s.scrap);
    const grossCost = d.wafers * d.waferPrice + sum(stages, s => s.material + s.labour + s.overhead);
    const netAbnormal = sum(stages, s => s.abnNet);
    const actual = { good: G, grossCost, scrapCash, netCost: grossCost - scrapCash, processCost: last.outValue,
      perChip: last.cpu, netAbnormal, allIn: (last.outValue + netAbnormal) / G };

    // 2. Standard allowed for the actual good output
    let cum = 1;                                   // standard yield up to the stage's input
    const Y = stages.reduce((p, s) => p * s.yieldStd, 1);
    const SQ = G / (d.dpw * Y);                    // wafers allowed
    const std = d.stages.map((s, i) => {
      const allowedIn = SQ * cum * (s.unit === 'die' ? d.dpw : 1);
      cum *= stages[i].yieldStd;
      return { allowedIn, cum,
        material: allowedIn * s.stdMatQty * s.stdMatPrice,
        conv: allowedIn * s.stdConv,
        scrap: allowedIn * (s.normalPct / 100) * s.scrap };
    });
    const stdTotal = SQ * d.stdWaferPrice + sum(std, s => s.material + s.conv - s.scrap);
    const stdCost = { wafersAllowed: SQ, wafer: SQ * d.stdWaferPrice, stages: std, total: stdTotal, perChip: stdTotal / G, cumYield: Y };

    // 3. Wafer usage (yield) variance, attributed to the stage that caused it
    const equiv = [d.wafers, ...stages.map((s, i) => s.good / (s.unit === 'die' ? d.dpw : 1) / std[i].cum)];
    const waferUsage = { SQ, AQ: d.wafers, SP: d.stdWaferPrice, total: (SQ - d.wafers) * d.stdWaferPrice, equiv,
      byStage: stages.map((_, i) => (equiv[i + 1] - equiv[i]) * d.stdWaferPrice) };

    // 4. Remaining variances
    const rows = d.stages.map((s, i) => {
      const a = stages[i], t = std[i];
      const yieldPart = (t.allowedIn - a.input) * s.stdMatQty * s.stdMatPrice;
      const consPart = (a.input * s.stdMatQty - s.matQty) * s.stdMatPrice;
      return { name: s.name, matName: s.matName, matUnit: s.matUnit,
        sq: t.allowedIn * s.stdMatQty, sqActualInput: a.input * s.stdMatQty, aq: s.matQty, sp: s.stdMatPrice,
        yieldPart, consPart, usage: yieldPart + consPart,
        price: (s.stdMatPrice - s.matPrice) * s.matQty,
        conv: t.conv - (s.labour + s.overhead),
        scrap: a.actualLoss * s.scrap - t.scrap };
    });
    const variances = {
      rows,
      waferPrice: (d.stdWaferPrice - d.waferPrice) * d.wafers,
      waferUsage: waferUsage.total,
      matUsage: sum(rows, r => r.usage), matPrice: sum(rows, r => r.price),
      conv: sum(rows, r => r.conv), scrap: sum(rows, r => r.scrap),
    };
    variances.materialUsage = variances.waferUsage + variances.matUsage;
    variances.materialPrice = variances.waferPrice + variances.matPrice;
    variances.total = variances.materialUsage + variances.materialPrice + variances.conv + variances.scrap;

    // 5. Two P&Ls and the reconciliation
    const sales = d.sold * d.price, closing = G - d.sold;
    const cogsA = d.sold * actual.perChip, cogsS = d.sold * stdCost.perChip;
    const pl = {
      sales, closing, sga: d.sga,
      actual: { cogs: cogsA, gross: sales - cogsA, abnormal: netAbnormal, closingStock: closing * actual.perChip,
        profit: sales - cogsA - netAbnormal - d.sga },
      standard: { cogs: cogsS, gross: sales - cogsS, variances: variances.total, closingStock: closing * stdCost.perChip,
        profit: sales - cogsS + variances.total - d.sga },
      recon: { perChipDiff: actual.perChip - stdCost.perChip, stockDiff: closing * (actual.perChip - stdCost.perChip) },
      // Memo only: chips the standard yield would have given from the same wafer starts.
      memo: { expectedChips: d.wafers * d.dpw * Y, lostChips: d.wafers * d.dpw * Y - G },
    };
    pl.memo.revenueForgone = pl.memo.lostChips * d.price;
    return { stages, actual, stdCost, waferUsage, variances, pl };
  }

  const api = { compute, validate, EXAMPLE };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.FabYield = api;
})(typeof self !== 'undefined' ? self : this);
