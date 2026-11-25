// Reads the form, runs the engine, renders. All rendered text is numbers or fixed labels, never user strings.
(function () {
  'use strict';
  const { compute, validate, EXAMPLE } = window.FabYield;
  const $ = id => document.getElementById(id);
  const out = (key, html) => { document.querySelector(`[data-out="${key}"]`).innerHTML = html; };

  // ---------- formatting ----------
  const fmt = (v, min, max) => {
    const f = Math.abs(v) < 0.5 * 10 ** -max ? 0 : v;       // no "-0"
    return f.toLocaleString('en-IN', { minimumFractionDigits: min, maximumFractionDigits: max }).replace('-', '−');
  };
  const money = v => fmt(v, 0, 0);
  const rate = v => fmt(v, 2, 2);
  const qty = v => fmt(v, 0, 2);
  const pct = v => fmt(v * 100, 2, 2) + '%';
  const paren = v => (v < -0.5 ? `(${money(-v)})` : money(v));
  const fa = v => (Math.abs(v) < 0.5 ? 'nil' : `<span class="${v > 0 ? 'F' : 'A'}">${money(Math.abs(v))} ${v > 0 ? 'F' : 'A'}</span>`);
  const abnWord = u => (u > 1e-9 ? 'abnormal loss' : u < -1e-9 ? 'abnormal gain' : 'no abnormal loss');

  // ---------- tables ----------
  // cols: [label, isNumeric]; rows: { c: [cells], k: row class }
  function table(caption, cols, rows, size = 'mid') {
    const head = cols.map(([l, n]) => `<th scope="col"${n ? ' class="n"' : ''}>${l}</th>`).join('');
    const body = rows.map(r => `<tr class="${r.k || ''}">` + r.c.map((x, i) =>
      i === 0 ? `<th scope="row">${x}</th>` : `<td${cols[i][1] ? ' class="n"' : ''}>${x}</td>`).join('') + '</tr>').join('');
    if (cols.length <= 3) size = 'narrow';
    return `<div class="scroll" role="group" aria-label="${caption}"><table class="${size}"><caption>${caption}</caption><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
  }

  // Entries: { t, u, r, amt }. withRate adds the rate column.
  function tAccount(caption, dr, cr, withRate) {
    const f = withRate ? ['u', 'r', 'amt'] : ['u', 'amt'];
    const show = { u: e => (e.u == null ? '' : qty(e.u)), r: e => (e.r == null ? '' : rate(e.r)), amt: e => money(e.amt) };
    const cells = (e, cls) => `<td class="${cls}">${e ? e.t : ''}</td>` + f.map(k => `<td class="n">${e ? show[k](e) : ''}</td>`).join('');
    const total = side => side.reduce((t, e) => t + e.amt, 0);
    const units = side => side.reduce((t, e) => t + (e.u || 0), 0);
    const rows = Array.from({ length: Math.max(dr.length, cr.length) }, (_, i) => `<tr>${cells(dr[i], '')}${cells(cr[i], 'cr')}</tr>`).join('');
    const tot = (side, cls) => cells({ t: 'Total', u: withRate ? units(side) : null, amt: total(side) }, cls);
    const head = cls => `<th scope="col" class="${cls}">Particulars</th><th scope="col" class="n">Units</th>${withRate ? '<th scope="col" class="n">Rate ₹</th>' : ''}<th scope="col" class="n">Amount ₹</th>`;
    const span = f.length + 1;
    const colgroup = (withRate ? [20, 9, 9, 12] : [27, 9, 14]).map(p => `<col style="width:${p}%">`).join('');
    return `<div class="scroll" role="group" aria-label="${caption}"><table class="taccount"><caption>${caption}</caption><colgroup>${colgroup}${colgroup}</colgroup>
      <thead><tr><th class="side" scope="colgroup" colspan="${span}">Dr</th><th class="side cr" scope="colgroup" colspan="${span}">Cr</th></tr><tr>${head('')}${head('cr')}</tr></thead>
      <tbody>${rows}<tr class="total">${tot(dr, '')}${tot(cr, 'cr')}</tr></tbody></table></div>`;
  }
  const working = s => `<p class="working">${s}</p>`;

  // ---------- form ----------
  const GENERAL = [
    ['Wafer starts', [['wafers', 'Wafers started'], ['dpw', 'Gross die per wafer'], ['waferPrice', 'Actual price per wafer (₹)'], ['stdWaferPrice', 'Standard price per wafer (₹)']]],
    ['Sales', [['sold', 'Good chips sold'], ['price', 'Selling price per chip (₹)'], ['sga', 'Selling and admin cost (₹)']]],
  ];
  const one = u => (u === 'wafers' ? 'wafer' : 'die');
  const stageFields = s => [
    ['matQty', `${s.matName} used${s.matUnit === 'sets' ? '' : ` (${s.matUnit})`}`], ['matPrice', `Price per ${s.matOne} (₹)`],
    ['labour', 'Labour (₹)'], ['overhead', 'Overhead (₹)'],
    ['normalPct', 'Normal loss (% of input)'], ['actualLoss', `Actual loss (${s.unit})`], ['scrap', `Scrap value per ${one(s.unit)} (₹)`],
    ['stdMatQty', `Standard ${s.matUnit} per ${one(s.unit)} input`], ['stdMatPrice', `Standard price per ${s.matOne} (₹)`],
    ['stdConv', `Standard labour and overhead per ${one(s.unit)} input (₹)`],
  ];
  const field = (path, label) => `<div class="field"><div><label for="${path}">${label}</label><span class="err" id="${path}-err"></span></div>
    <input id="${path}" name="${path}" type="number" inputmode="decimal" min="0" step="any" required aria-describedby="${path}-err"></div>`;
  const group = (title, fields) => `<fieldset><legend>${title}</legend>${fields.map(([p, l]) => field(p, l)).join('')}</fieldset>`;

  $('general').innerHTML = GENERAL.map(([t, f]) => group(t, f)).join('');
  $('stages').innerHTML = EXAMPLE.stages.map((s, i) => group(s.name, stageFields(s).map(([k, l]) => [`stages.${i}.${k}`, l]))).join('');
  const inputs = [...$('form').querySelectorAll('input')];
  const lookup = (o, path) => path.split('.').reduce((x, k) => x[k], o);

  function fill() { inputs.forEach(el => { el.value = lookup(EXAMPLE, el.name); }); update(); }

  function read() {
    const d = JSON.parse(JSON.stringify(EXAMPLE));
    inputs.forEach(el => {
      const keys = el.name.split('.'), last = keys.pop();
      keys.reduce((x, k) => x[k], d)[last] = el.valueAsNumber;   // NaN when blank or not a number
    });
    return d;
  }

  function update() {
    const d = read(), errors = validate(d);
    inputs.forEach(el => {
      const msg = errors[el.name] || '';
      el.setAttribute('aria-invalid', msg ? 'true' : 'false');
      $(el.name + '-err').textContent = msg;
    });
    const n = Object.keys(errors).length;
    $('live').dataset.state = n ? 'error' : 'ok';
    if (n) { $('status').textContent = `Correct ${n} ${n === 1 ? 'field' : 'fields'}. Results below still show the last valid inputs.`; return; }
    const r = compute(d);
    $('status').textContent = `Cost per good chip ₹${rate(r.actual.perChip)}. Process profit ₹${paren(r.pl.actual.profit)}. Standard profit ₹${paren(r.pl.standard.profit)}.`;
    render(d, r);
    markScrollers();
  }

  // Only tables that actually scroll become tab stops.
  function markScrollers() {
    document.querySelectorAll('.scroll').forEach(el => {
      if (el.scrollWidth > el.clientWidth) el.tabIndex = 0; else el.removeAttribute('tabindex');
    });
  }

  // ---------- render ----------
  function render(d, r) {
    const { stages, actual, stdCost, waferUsage: w, variances: v, pl } = r;

    // Summary
    out('perChip', `₹${rate(actual.perChip)}`);
    out('summaryText', `${qty(actual.good)} good chips from ${qty(d.wafers)} wafer starts, costed through etching, doping and packaging.`);
    out('facts', [
      ['Standard cost per good chip', `₹${rate(stdCost.perChip)}`],
      ['All-in cost, abnormal loss included', `₹${rate(actual.allIn)}`],
      ['Yield, actual against standard', `${pct(actual.good / (d.wafers * d.dpw))} / ${pct(stdCost.cumYield)}`],
      [actual.netAbnormal < -0.5 ? 'Net abnormal gain' : 'Net abnormal loss', `₹${money(Math.abs(actual.netAbnormal))}`],
      ['Profit, process costing', `₹${paren(pl.actual.profit)}`],
      ['Profit, standard costing', `₹${paren(pl.standard.profit)}`],
    ].map(([a, b]) => `<div><dt>${a}</dt><dd>${b}</dd></div>`).join(''));

    // Process accounts
    out('accounts', stages.map((s, i) => {
      const next = i + 1 < stages.length ? `${stages[i + 1].name} process` : 'Finished goods';
      const dr = [
        { t: i ? `${stages[i - 1].name} process` : 'Wafers issued', u: s.input, r: s.inCost / s.input, amt: s.inCost },
        { t: s.matName, amt: s.material }, { t: 'Labour', amt: s.labour }, { t: 'Overhead', amt: s.overhead },
      ];
      if (s.gain) dr.push({ t: 'Abnormal gain', u: s.gain, r: s.cpu, amt: s.gain * s.cpu });
      const cr = [{ t: `Normal loss (${qty(s.normalPct)}%)`, u: s.normalUnits, r: s.scrap, amt: s.normalScrap }];
      if (s.loss) cr.push({ t: 'Abnormal loss', u: s.loss, r: s.cpu, amt: s.loss * s.cpu });
      cr.push({ t: next, u: s.good, r: s.cpu, amt: s.outValue });
      const conv = s.unit === 'die' ? `Input: ${qty(stages[i - 1].good)} wafers × ${qty(d.dpw)} die per wafer = ${qty(s.input)} die.<br>` : '';
      const abn = Math.abs(s.abnUnits) < 1e-9 ? '' : `<br>${abnWord(s.abnUnits).replace('a', 'A')}: expected good ${qty(s.expected)}, actual good ${qty(s.good)}, difference ${qty(Math.abs(s.abnUnits))} ${s.unit} at ₹${rate(s.cpu)}.`;
      return `<div class="block">${tAccount(`${s.name} process account (${s.unit})`, dr, cr, true)}${working(
        `${conv}Cost per unit = (cost ${money(s.D)} − normal loss scrap ${money(s.normalScrap)}) ÷ (input ${qty(s.input)} − normal loss ${qty(s.normalUnits)}) = ₹${rate(s.cpu)}.${abn}`)}</div>`;
    }).join(''));

    const merge = (key, side) => stages.flatMap(s => s[key][side].map(e => ({
      ...e, t: e.t.includes(s.name) ? e.t : `${e.t}, ${s.name.toLowerCase()}` })));
    const ledger = (title, key) => {
      const dr = merge(key, 'dr'), cr = merge(key, 'cr');
      return dr.length ? tAccount(title, dr, cr, false) : working(`${title}: no entries this month.`);
    };
    out('ledgers', ledger('Normal loss account', 'normalLedger') + ledger('Abnormal loss account', 'lossLedger') + ledger('Abnormal gain account', 'gainLedger'));

    // Cost per good chip
    const G = actual.good;
    out('buildup', table('Build-up for all good chips', [['Cost element'], ['Total ₹', 1], ['Per good chip ₹', 1]], [
      { c: ['Wafers', money(d.wafers * d.waferPrice), rate(d.wafers * d.waferPrice / G)] },
      ...stages.map(s => ({ c: [`${s.name}: material, labour, overhead`, money(s.material + s.labour + s.overhead), rate((s.material + s.labour + s.overhead) / G)] })),
      { c: ['Less cash from scrap', paren(-actual.scrapCash), rate(-actual.scrapCash / G)] },
      { k: 'sub', c: ['All-in cost', money(actual.netCost), rate(actual.allIn)] },
      { c: [actual.netAbnormal < 0 ? 'Add net abnormal gain' : 'Less net abnormal loss', paren(-actual.netAbnormal), rate(-actual.netAbnormal / G)] },
      { k: 'total', c: ['Process cost of good chips', money(actual.processCost), rate(actual.perChip)] },
    ]));
    renderWafer(d, r);

    // Standard v actual
    out('yieldTable', table('Yield by stage', [['Stage'], ['Input', 1], ['Expected good', 1], ['Actual good', 1], ['Standard yield', 1], ['Actual yield', 1], ['Difference (points)', 1]], [
      ...stages.map(s => ({ c: [`${s.name} (${s.unit})`, qty(s.input), qty(s.expected), qty(s.good), pct(s.yieldStd), pct(s.yieldAct), fmt((s.yieldAct - s.yieldStd) * 100, 2, 2)] })),
      { k: 'total', c: ['Wafer start to good chip (die)', qty(d.wafers * d.dpw), qty(pl.memo.expectedChips), qty(G), pct(stdCost.cumYield), pct(G / (d.wafers * d.dpw)), fmt((G / (d.wafers * d.dpw) - stdCost.cumYield) * 100, 2, 2)] },
    ], 'wide'));

    out('waferUsage', table('Wafer usage variance by stage', [['Stage'], ['Output in standard wafer starts', 1], ['Change', 1], ['Variance ₹', 1]], [
      { c: ['Wafers started', qty(w.AQ), '', ''] },
      ...stages.map((s, i) => ({ c: [s.name, qty(w.equiv[i + 1]), qty(w.equiv[i + 1] - w.equiv[i]), fa(w.byStage[i])] })),
      { k: 'total', c: ['Wafer usage variance', qty(w.SQ), qty(w.SQ - w.AQ), fa(w.total)] },
    ]) + working(`Wafers allowed = ${qty(G)} good chips ÷ (${qty(d.dpw)} die × ${pct(stdCost.cumYield)} standard yield) = ${qty(w.SQ)}.<br>
      Usage variance = (allowed ${qty(w.SQ)} − used ${qty(w.AQ)}) × standard price ₹${rate(w.SP)} = ${fa(w.total)}.<br>
      Each stage converts its output back to the wafer starts it would have needed at standard yield. The change from the stage before is that stage’s share.`));

    out('matUsage', table('Material usage variance', [['Material'], ['Standard for output', 1], ['Standard for actual input', 1], ['Actual used', 1], ['Standard price ₹', 1], ['Yield part ₹', 1], ['Consumption part ₹', 1], ['Usage variance ₹', 1]], [
      { c: ['Wafers', qty(w.SQ), qty(w.AQ), qty(w.AQ), rate(w.SP), fa(w.total), fa(0), fa(w.total)] },
      ...v.rows.map(x => ({ c: [`${x.matName}${x.matUnit === 'sets' ? '' : ` (${x.matUnit})`}`, qty(x.sq), qty(x.sqActualInput), qty(x.aq), rate(x.sp), fa(x.yieldPart), fa(x.consPart), fa(x.usage)] })),
      { k: 'total', c: ['Material usage variance', '', '', '', '', fa(w.total + v.rows.reduce((t, x) => t + x.yieldPart, 0)), fa(v.rows.reduce((t, x) => t + x.consPart, 0)), fa(v.materialUsage)] },
    ], 'wide') + working('Yield part: material spent on units that a standard yield would not have needed. Consumption part: more or less material per unit than standard.'));

    out('variances', table('All variances, reconciling standard to actual cost', [['Item'], ['₹', 1]], [
      { c: ['Standard cost of good chips', money(stdCost.total)] },
      { c: ['Material usage', fa(v.materialUsage)] },
      { c: ['Material price', fa(v.materialPrice)] },
      ...v.rows.map(x => ({ c: [`Labour and overhead, ${x.name.toLowerCase()}`, fa(x.conv)] })),
      { c: ['Scrap proceeds', fa(v.scrap)] },
      { k: 'sub', c: ['Total variance', fa(v.total)] },
      { k: 'total', c: ['Actual cost, net of scrap cash', money(actual.netCost)] },
    ]));

    // P&L
    const A = pl.actual, S = pl.standard;
    out('pl', table('Profit and loss for the month', [['Item'], ['Process costing ₹', 1], ['Standard costing ₹', 1]], [
      { c: [`Sales, ${qty(d.sold)} chips at ₹${rate(d.price)}`, money(pl.sales), money(pl.sales)] },
      { c: ['Cost of chips sold', paren(-A.cogs), paren(-S.cogs)] },
      { k: 'sub', c: ['Gross profit', paren(A.gross), paren(S.gross)] },
      { c: [A.abnormal < 0 ? 'Net abnormal gain' : 'Net abnormal loss', paren(-A.abnormal), 'not charged'] },
      { c: ['Material usage variance', 'not charged', paren(v.materialUsage)] },
      { c: ['Material price variance', 'in cost', paren(v.materialPrice)] },
      { c: ['Labour and overhead variance', 'in cost', paren(v.conv)] },
      { c: ['Scrap variance', 'in cost', paren(v.scrap)] },
      { c: ['Selling and admin', paren(-pl.sga), paren(-pl.sga)] },
      { k: 'total', c: ['Net profit', paren(A.profit), paren(S.profit)] },
      { c: [`Closing stock, ${qty(pl.closing)} chips`, money(A.closingStock), money(S.closingStock)] },
    ]));

    out('recon', table('Reconciling the two profits', [['Item'], ['₹', 1]], [
      { c: ['Profit, standard costing', paren(S.profit)] },
      { c: [`Closing stock valued at actual instead of standard: ${qty(pl.closing)} chips × (₹${fmt(actual.perChip, 4, 4)} − ₹${fmt(stdCost.perChip, 4, 4)})`, paren(pl.recon.stockDiff)] },
      { k: 'total', c: ['Profit, process costing', paren(A.profit)] },
    ]) + working(pl.closing === 0
      ? 'Every chip was sold, so no stock is carried forward and both methods report the same profit.'
      : 'Both methods start from the same total cost. They part only on the value of unsold chips, and the gap closes when those chips are sold.'));

    out('impact', table('Yield loss charged to profit', [['Stage'], ['Abnormal units', 1], ['At process cost ₹', 1], ['Scrap value ₹', 1], ['Charge to profit ₹', 1], ['% of sales', 1]], [
      ...stages.map(s => ({ c: [`${s.name}, ${abnWord(s.abnUnits)}`, `${qty(Math.abs(s.abnUnits))} ${s.unit}`, paren(s.abnValue), paren(s.abnScrap), paren(s.abnNet), pl.sales ? pct(s.abnNet / pl.sales) : 'n/a'] })),
      { k: 'total', c: ['Net charge', '', paren(stages.reduce((t, s) => t + s.abnValue, 0)), paren(stages.reduce((t, s) => t + s.abnScrap, 0)), paren(actual.netAbnormal), pl.sales ? pct(actual.netAbnormal / pl.sales) : 'n/a'] },
    ], 'wide') + working(`Amounts in brackets are gains that add to profit.<br>Memo only, not charged: at standard yield the same wafer starts would have given ${qty(pl.memo.expectedChips)} good chips, ${qty(Math.abs(pl.memo.lostChips))} ${pl.memo.lostChips >= 0 ? 'more' : 'fewer'} than produced. At ₹${rate(d.price)} each that is ₹${money(Math.abs(pl.memo.revenueForgone))} of sales ${pl.memo.lostChips >= 0 ? 'forgone' : 'gained'}, if demand exists.`));
  }

  // 500 cells, each 1/500 of the die started. A proportion diagram, not a defect map.
  const CELLS = 500, GRID = 26;
  const cells = [];
  for (let y = 0; y < GRID; y++) for (let x = 0; x < GRID; x++) cells.push({ x, y, d: Math.hypot(x - (GRID - 1) / 2, y - (GRID - 1) / 2) });
  const disc = cells.sort((a, b) => a.d - b.d).slice(0, CELLS).sort((a, b) => a.y - b.y || a.x - b.x);

  function renderWafer(d, r) {
    const start = d.wafers * d.dpw;
    const parts = [['Good chips', r.actual.good], ...r.stages.map(s => [`Lost in ${s.name.toLowerCase()}`, s.actualLoss * (s.unit === 'die' ? 1 : d.dpw)])];
    // largest remainder, so the cells always total 500
    const raw = parts.map(p => p[1] / start * CELLS), count = raw.map(Math.floor);
    raw.map((x, i) => [x - count[i], i]).sort((a, b) => b[0] - a[0]).slice(0, CELLS - count.reduce((a, b) => a + b, 0)).forEach(([, i]) => count[i]++);
    const cls = count.flatMap((n, i) => Array(n).fill(`d${i}`));
    out('wafer', `<svg viewBox="-1 -1 28 28" role="img" aria-label="${parts.map(p => `${p[0]} ${pct(p[1] / start)}`).join(', ')} of die started">
      <circle class="rim" cx="13" cy="13" r="13.6"/>${disc.map((c, i) => `<rect class="${cls[i]}" x="${c.x + 0.08}" y="${c.y + 0.08}" width=".84" height=".84"/>`).join('')}</svg>
      <figcaption class="block"><h3>Where the die started went</h3><ul class="legend">${parts.map((p, i) => `<li><span class="swatch d${i}"></span><span>${p[0]}</span><span>${qty(p[1])} (${pct(p[1] / start)})</span></li>`).join('')}</ul>
      <p class="working muted">Each cell is 1/${CELLS} of the ${qty(start)} die started. The bands show proportions, not positions of defects. Losses include normal and abnormal.</p></figcaption>`);
  }

  // ---------- events ----------
  $('form').addEventListener('input', update);
  $('form').addEventListener('submit', e => e.preventDefault());
  $('reset').addEventListener('click', fill);
  window.addEventListener('resize', markScrollers);
  $('print').addEventListener('click', () => window.print());
  fill();
})();
