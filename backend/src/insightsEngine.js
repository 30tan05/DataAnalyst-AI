const { toNum, isBlank, mean, median, stddev, percentile, pearsonCorrelation } = require('./dataEngine');

// ─── Pick best columns for visualization ─────────────────────────────────────
function pickDateColumn(columnStats) {
  return columnStats.find(c => c.type === 'date')?.name || null;
}

function pickCategoricalColumns(columnStats, exclude = []) {
  const cats = columnStats.filter(c => c.type === 'categorical' && !exclude.includes(c.name));
  return cats.sort((a, b) => Math.abs((a.unique || 0) - 6) - Math.abs((b.unique || 0) - 6));
}

function pickCategoricalColumn(columnStats, exclude = []) {
  const cats = pickCategoricalColumns(columnStats, exclude);
  return cats.length ? cats[0].name : null;
}

function fmtLabel(s) {
  if (!s) return '';
  return String(s).replace(/_/g, ' ');
}

function fmtNum(n, opts = {}) {
  if (n === null || n === undefined || isNaN(n)) return '—';
  const abs = Math.abs(n);
  if (opts.compact && abs >= 1000) {
    if (abs >= 1000000) return (n / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
    return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
  }
  return n.toLocaleString(undefined, { maximumFractionDigits: 1 });
}

function looksLikeCurrency(colName) {
  return /price|revenue|salary|cost|amount|income|sales|value|pay|fee|budget|profit/i.test(colName);
}

function fmtMaybeCurrency(n, colName, opts = {}) {
  const num = fmtNum(n, opts);
  return looksLikeCurrency(colName) ? `$${num}` : num;
}

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function generateTimeSeries(rawSample, dateCol, numericCols) {
  if (!dateCol || numericCols.length === 0) return null;

  const buckets = {};
  rawSample.forEach(row => {
    const raw = row[dateCol];
    if (isBlank(raw)) return;
    const d = new Date(raw);
    if (isNaN(d.getTime())) return;
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (!buckets[key]) buckets[key] = { _count: 0 };
    buckets[key]._count += 1;
    numericCols.forEach(col => {
      const v = toNum(row[col]);
      if (!isNaN(v)) buckets[key][col] = (buckets[key][col] || 0) + v;
    });
  });

  const sortedKeys = Object.keys(buckets).sort();
  if (sortedKeys.length < 2) return null;

  return sortedKeys.map(key => {
    const [year, month] = key.split('-');
    const monthIdx = parseInt(month) - 1;
    const entry = {
      month: `${MONTH_NAMES[monthIdx].slice(0, 3)} '${year.slice(2)}`,
      monthFull: `${MONTH_NAMES[monthIdx]} ${year}`,
      _count: buckets[key]._count,
    };
    numericCols.forEach(col => { entry[col] = Math.round((buckets[key][col] || 0) * 100) / 100; });
    return entry;
  });
}

function generateCategoryBreakdown(rawSample, catCol, numericCol, aggMode = 'sum') {
  if (!catCol) return null;
  const groups = {};
  rawSample.forEach(row => {
    const key = isBlank(row[catCol]) ? 'Unknown' : String(row[catCol]);
    if (!groups[key]) groups[key] = { count: 0, sum: 0, vals: [] };
    groups[key].count += 1;
    if (numericCol) {
      const v = toNum(row[numericCol]);
      if (!isNaN(v)) { groups[key].sum += v; groups[key].vals.push(v); }
    }
  });

  return Object.entries(groups)
    .map(([name, g]) => ({
      name,
      value: numericCol ? (aggMode === 'avg' ? Math.round((mean(g.vals) || 0) * 100) / 100 : Math.round(g.sum * 100) / 100) : g.count,
      count: g.count,
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 10);
}

function generateTopEntities(rawSample, catCol, numericCol) {
  const breakdown = generateCategoryBreakdown(rawSample, catCol, numericCol);
  if (!breakdown) return null;
  return breakdown.slice(0, 8).map(b => ({
    name: b.name.length > 18 ? b.name.slice(0, 16) + '…' : b.name,
    revenue: b.value,
    units: b.count,
  }));
}

function generateDistribution(rawSample, col, bins = 8) {
  const vals = rawSample.map(r => toNum(r[col])).filter(v => !isNaN(v));
  if (vals.length < 5) return null;
  const min = Math.min(...vals), max = Math.max(...vals);
  if (min === max) return null;
  const width = (max - min) / bins;
  const counts = new Array(bins).fill(0);
  vals.forEach(v => {
    let idx = Math.floor((v - min) / width);
    if (idx >= bins) idx = bins - 1;
    if (idx < 0) idx = 0;
    counts[idx]++;
  });
  return counts.map((c, i) => ({
    range: `${fmtNum(min + i * width, { compact: true })}–${fmtNum(min + (i + 1) * width, { compact: true })}`,
    count: c,
  }));
}

function pickEntityColumn(columnStats, excludeCols = []) {
  const nameLike = columnStats.filter(c =>
    !excludeCols.includes(c.name) &&
    (c.type === 'string' || c.type === 'categorical') &&
    /name|employee|customer|client|product|item|user|student|rep|agent|salesperson|vendor|seller/i.test(c.name) &&
    (c.unique || 0) >= 2
  );
  if (nameLike.length > 0) return nameLike[0].name;

  const idLike = columnStats.find(c => c.type === 'string' && !excludeCols.includes(c.name) && (c.unique || 0) > 5);
  return idLike ? idLike.name : null;
}

function generateDashboard(analysisData, dashboardType, chartPrefs = {}) {
  const { rawSample, columnStats, numericCols } = analysisData;

  const dateCol = chartPrefs.dateColumn || pickDateColumn(columnStats);
  const entityColForDash = pickEntityColumn(columnStats, []);
  const nonEntityCats = pickCategoricalColumns(columnStats, entityColForDash ? [entityColForDash] : []);
  const catCol = chartPrefs.categoryColumn || (nonEntityCats[0]?.name) || pickCategoricalColumn(columnStats);
  const catCol2 = pickCategoricalColumn(columnStats, catCol ? [catCol] : []);
  const topNumeric = chartPrefs.valueColumn || numericCols[0] || null;
  const secondNumeric = numericCols.find(c => c !== topNumeric) || null;

  const kpis = generateKpis(rawSample, columnStats, numericCols);
  const timeSeries = generateTimeSeries(rawSample, dateCol, numericCols.slice(0, 2));
  const categoryBreakdown = generateCategoryBreakdown(rawSample, catCol, topNumeric);
  const topEntities = generateTopEntities(rawSample, catCol2 || catCol, topNumeric);
  const distribution = topNumeric ? generateDistribution(rawSample, topNumeric) : null;

  const styleConfig = {
    executive: { primary: 'trend', secondary: 'category', showDistribution: false, showTopEntities: true },
    analytical: { primary: 'distribution', secondary: 'correlation', showDistribution: true, showTopEntities: true },
    operational: { primary: 'category', secondary: 'trend', showDistribution: false, showTopEntities: true },
    storytelling: { primary: 'trend', secondary: 'category', showDistribution: false, showTopEntities: false },
  };
  const config = styleConfig[dashboardType] || styleConfig.executive;

  let scatterData = null;
  if (numericCols.length >= 2) {
    const a = topNumeric, b = secondNumeric;
    if (a && b) {
      scatterData = rawSample
        .map(r => ({ x: toNum(r[a]), y: toNum(r[b]) }))
        .filter(p => !isNaN(p.x) && !isNaN(p.y))
        .slice(0, 200);
    }
  }

  return {
    type: dashboardType,
    config,
    hasTimeSeries: !!timeSeries,
    hasCategoryData: !!categoryBreakdown,
    hasDistribution: !!distribution,
    hasScatter: !!(scatterData && scatterData.length > 5),
    dateColumn: dateCol,
    categoryColumn: catCol,
    valueColumn: topNumeric,
    secondaryValueColumn: secondNumeric,
    availableColumns: {
      dateColumns: columnStats.filter(c => c.type === 'date').map(c => c.name),
      categoricalColumns: columnStats.filter(c => c.type === 'categorical').map(c => c.name),
      numericColumns: numericCols,
    },
    kpis,
    timeSeries: timeSeries || [],
    timeSeriesKeys: numericCols.slice(0, 2),
    categoryBreakdown: categoryBreakdown || [],
    topEntities: topEntities || [],
    distribution: distribution || [],
    scatterData: scatterData || [],
  };
}

function generateKpis(rawSample, columnStats, numericCols) {
  const kpis = [];

  numericCols.slice(0, 4).forEach(col => {
    const vals = rawSample.map(r => toNum(r[col])).filter(v => !isNaN(v));
    if (vals.length === 0) return;
    const total = vals.reduce((a, b) => a + b, 0);

    const formatNum = (n) => fmtMaybeCurrency(n, col, { compact: true });

    const half = Math.floor(vals.length / 2);
    const firstHalfAvg = mean(vals.slice(0, half));
    const secondHalfAvg = mean(vals.slice(half));
    const change = firstHalfAvg !== 0 ? ((secondHalfAvg - firstHalfAvg) / Math.abs(firstHalfAvg)) * 100 : 0;

    kpis.push({
      label: `Total ${fmtLabel(col)}`,
      value: formatNum(total),
      change: `${change >= 0 ? '+' : ''}${change.toFixed(1)}%`,
      trend: change >= 0 ? 'up' : 'down',
    });
  });

  if (kpis.length < 2) {
    kpis.push({ label: 'Total Records', value: rawSample.length.toLocaleString(), change: '', trend: 'up' });
  }

  return kpis.slice(0, 4);
}

function generateInsights(analysisData) {
  const { rawSample, columnStats, numericCols } = analysisData;
  const findings = [];

  const dateCol = pickDateColumn(columnStats);
  const catCols = pickCategoricalColumns(columnStats);
  const entityCol = pickEntityColumn(columnStats, []);
  const primaryCatCol = catCols.find(c => c.name !== entityCol)?.name || catCols[0]?.name;

  if (dateCol && numericCols.length > 0) {
    const primaryCol = numericCols[0];
    const ts = generateTimeSeries(rawSample, dateCol, [primaryCol]);
    if (ts && ts.length >= 3) {
      const values = ts.map(t => t[primaryCol] || 0);
      const avg = mean(values);
      const maxVal = Math.max(...values);
      const minVal = Math.min(...values);
      const maxEntry = ts[values.indexOf(maxVal)];
      const minEntry = ts[values.indexOf(minVal)];
      const peakPctAboveAvg = avg !== 0 ? ((maxVal - avg) / Math.abs(avg)) * 100 : 0;
      const troughPctBelowAvg = avg !== 0 ? ((avg - minVal) / Math.abs(avg)) * 100 : 0;

      if (peakPctAboveAvg > 8) {
        findings.push({
          type: 'trend',
          title: `${maxEntry.monthFull} Was the Strongest Period`,
          description: `${fmtLabel(primaryCol)} peaked in ${maxEntry.monthFull} at ${fmtMaybeCurrency(maxVal, primaryCol, { compact: true })}, which is ${peakPctAboveAvg.toFixed(0)}% above the period average of ${fmtMaybeCurrency(avg, primaryCol, { compact: true })}.`,
          confidence: Math.min(97, 78 + Math.min(18, peakPctAboveAvg / 3)),
        });
      }
      if (troughPctBelowAvg > 8 && minEntry.month !== maxEntry.month) {
        findings.push({
          type: 'anomaly',
          title: `${minEntry.monthFull} Underperformed`,
          description: `${fmtLabel(primaryCol)} dropped to its lowest point in ${minEntry.monthFull} at ${fmtMaybeCurrency(minVal, primaryCol, { compact: true })}, ${troughPctBelowAvg.toFixed(0)}% below the period average — worth investigating what changed.`,
          confidence: Math.min(95, 76 + Math.min(18, troughPctBelowAvg / 3)),
        });
      }

      if (ts.length >= 4) {
        const half = Math.floor(ts.length / 2);
        const firstAvg = mean(values.slice(0, half));
        const secondAvg = mean(values.slice(half));
        const change = firstAvg !== 0 ? ((secondAvg - firstAvg) / Math.abs(firstAvg)) * 100 : 0;
        if (Math.abs(change) > 5) {
          findings.push({
            type: change > 0 ? 'trend' : 'anomaly',
            title: `${fmtLabel(primaryCol)} ${change > 0 ? 'Trending Up' : 'Trending Down'} Over Time`,
            description: `Comparing the first half of the period to the second half, ${fmtLabel(primaryCol)} ${change > 0 ? 'grew' : 'declined'} by ${Math.abs(change).toFixed(1)}% — from an average of ${fmtMaybeCurrency(firstAvg, primaryCol, { compact: true })} to ${fmtMaybeCurrency(secondAvg, primaryCol, { compact: true })} per period.`,
            confidence: Math.min(94, 72 + Math.min(20, Math.abs(change) / 2)),
          });
        }
      }
    }
  }

  const concentrationCols = catCols.filter(c => c.name !== entityCol).slice(0, 2);
  concentrationCols.forEach(catColStat => {
    const catCol = catColStat.name;
    numericCols.slice(0, 1).forEach(numCol => {
      const breakdown = generateCategoryBreakdown(rawSample, catCol, numCol);
      if (breakdown && breakdown.length > 1) {
        const total = breakdown.reduce((s, b) => s + b.value, 0);
        const top = breakdown[0];
        const second = breakdown[1];
        const topShare = total > 0 ? (top.value / total) * 100 : 0;
        const secondShare = total > 0 ? (second.value / total) * 100 : 0;
        const multiple = second.value > 0 ? top.value / second.value : null;

        if (topShare > (100 / breakdown.length) * 1.25) {
          const comparison = multiple && multiple > 1.3
            ? `, ${multiple.toFixed(1)}x more than ${second.name}, the next closest`
            : ` ahead of ${second.name} at ${secondShare.toFixed(1)}%`;
          findings.push({
            type: 'regional',
            title: `${top.name} Leads in ${fmtLabel(numCol)}`,
            description: `${top.name} accounts for ${topShare.toFixed(1)}% of total ${fmtLabel(numCol)} (${fmtMaybeCurrency(top.value, numCol, { compact: true })})${comparison} across all ${fmtLabel(catCol)} groups.`,
            confidence: Math.min(97, 80 + Math.min(15, topShare - (100 / breakdown.length))),
          });
        }

        const bottom = breakdown[breakdown.length - 1];
        const bottomShare = total > 0 ? (bottom.value / total) * 100 : 0;
        if (breakdown.length >= 4 && bottomShare < (100 / breakdown.length) * 0.5 && bottom.name !== top.name) {
          findings.push({
            type: 'anomaly',
            title: `${bottom.name} Lags Behind`,
            description: `${bottom.name} contributes only ${bottomShare.toFixed(1)}% of total ${fmtLabel(numCol)}, the smallest share of all ${fmtLabel(catCol)} groups — a potential area to investigate or support.`,
            confidence: 84,
          });
        }
      }
    });
  });

  if (entityCol && numericCols.length > 0) {
    const primaryCol = numericCols[0];
    const grouped = {};
    rawSample.forEach(r => {
      const name = r[entityCol];
      const v = toNum(r[primaryCol]);
      if (isBlank(name) || isNaN(v)) return;
      const key = String(name);
      if (!grouped[key]) grouped[key] = { sum: 0, count: 0 };
      grouped[key].sum += v;
      grouped[key].count += 1;
    });

    const entities = Object.entries(grouped).map(([name, g]) => ({ name, total: g.sum, avg: g.sum / g.count, count: g.count }));

    if (entities.length >= 3) {
      const totals = entities.map(e => e.total).sort((a, b) => a - b);
      const sortedDesc = [...entities].sort((a, b) => b.total - a.total);
      const top = sortedDesc[0];
      const topRank = totals.filter(v => v < top.total).length / totals.length * 100;

      findings.push({
        type: 'retention',
        title: `${top.name} Leads on ${fmtLabel(primaryCol)}`,
        description: `${top.name} recorded a total ${fmtLabel(primaryCol)} of ${fmtMaybeCurrency(top.total, primaryCol, { compact: true })} across ${top.count} record${top.count === 1 ? '' : 's'}, outperforming ${topRank.toFixed(0)}% of all ${entities.length} ${fmtLabel(entityCol)} entries — the top result in this dataset.`,
        confidence: 95,
      });

      const med = median(totals);
      const sd = stddev(totals);
      if (sd > 0 && entities.length >= 5) {
        const aboveMedianCount = totals.filter(v => v > med).length;
        findings.push({
          type: 'forecast',
          title: `${fmtLabel(entityCol)} Performance Spread`,
          description: `The median total ${fmtLabel(primaryCol)} per ${fmtLabel(entityCol).toLowerCase()} is ${fmtMaybeCurrency(med, primaryCol, { compact: true })}. ${aboveMedianCount} of ${entities.length} ${fmtLabel(entityCol).toLowerCase()}s perform above this midpoint, while the bottom performer reached only ${fmtMaybeCurrency(Math.min(...totals), primaryCol, { compact: true })}.`,
          confidence: 86,
        });
      }
    }
  }

  if (numericCols.length >= 2) {
    let bestPair = null;
    for (let i = 0; i < numericCols.length; i++) {
      for (let j = i + 1; j < numericCols.length; j++) {
        const a = rawSample.map(r => toNum(r[numericCols[i]])).filter(v => !isNaN(v));
        const b = rawSample.map(r => toNum(r[numericCols[j]])).filter(v => !isNaN(v));
        const n = Math.min(a.length, b.length);
        if (n < 8) continue;
        const r = pearsonCorrelation(a.slice(0, n), b.slice(0, n));
        if (!bestPair || Math.abs(r) > Math.abs(bestPair.r)) {
          bestPair = { a: numericCols[i], b: numericCols[j], r };
        }
      }
    }
    if (bestPair && Math.abs(bestPair.r) > 0.45) {
      const strength = Math.abs(bestPair.r) > 0.7 ? 'strong' : 'moderate';
      const direction = bestPair.r > 0 ? 'rises' : 'falls';
      findings.push({
        type: 'correlation',
        title: `${fmtLabel(bestPair.a)} and ${fmtLabel(bestPair.b)} Move Together`,
        description: `There is a ${strength} ${bestPair.r > 0 ? 'positive' : 'negative'} relationship (r=${bestPair.r.toFixed(2)}) between ${fmtLabel(bestPair.a)} and ${fmtLabel(bestPair.b)} — as ${fmtLabel(bestPair.a)} increases, ${fmtLabel(bestPair.b)} typically ${direction}. This could inform forecasting or resource planning.`,
        confidence: Math.round(Math.abs(bestPair.r) * 100),
      });
    }
  }

  const outlierIssue = (analysisData.issues || []).find(i => i.type === 'outliers');
  if (outlierIssue) {
    const pctOfData = ((outlierIssue.count / analysisData.rows) * 100).toFixed(1);
    findings.push({
      type: 'anomaly',
      title: `${outlierIssue.count} Unusual Values in ${fmtLabel(outlierIssue.column)}`,
      description: `${outlierIssue.count} record${outlierIssue.count === 1 ? '' : 's'} (${pctOfData}% of the dataset) in ${fmtLabel(outlierIssue.column)} fall well outside the normal range. These could be data entry errors or genuinely exceptional cases worth a closer look.`,
      confidence: 88,
    });
  }

  if (numericCols.length > 0 && findings.length < 5) {
    const col = numericCols[0];
    const vals = rawSample.map(r => toNum(r[col])).filter(v => !isNaN(v));
    if (vals.length > 5) {
      const med = median(vals);
      const avg = mean(vals);
      const skew = avg !== 0 ? ((avg - med) / Math.abs(avg)) * 100 : 0;
      if (Math.abs(skew) > 12) {
        findings.push({
          type: 'forecast',
          title: `${fmtLabel(col)} Distribution Is ${skew > 0 ? 'Skewed by High Outliers' : 'Skewed by Low Outliers'}`,
          description: `The average ${fmtLabel(col)} (${fmtMaybeCurrency(avg, col, { compact: true })}) is noticeably ${skew > 0 ? 'higher' : 'lower'} than the typical (median) value of ${fmtMaybeCurrency(med, col, { compact: true })}, meaning a small number of ${skew > 0 ? 'high' : 'low'} values are pulling the average ${skew > 0 ? 'up' : 'down'}. The median is a more representative figure here.`,
          confidence: 83,
        });
      }
    }
  }

  if (findings.length === 0) {
    findings.push({
      type: 'retention',
      title: 'Dataset Composition',
      description: `This dataset contains ${analysisData.rows.toLocaleString()} rows across ${analysisData.columns} columns, including ${numericCols.length} numeric field${numericCols.length === 1 ? '' : 's'} and ${catCols.length} categorical grouping${catCols.length === 1 ? '' : 's'} suitable for deeper analysis.`,
      confidence: 90,
    });
  }

  const priorityOrder = ['trend', 'regional', 'retention', 'correlation', 'anomaly', 'forecast'];
  findings.sort((a, b) => priorityOrder.indexOf(a.type) - priorityOrder.indexOf(b.type));

  const top = findings[0];
  const summary = top
    ? `Analysis of ${analysisData.fileName} surfaced ${findings.length} notable finding${findings.length === 1 ? '' : 's'}. Most significant: ${top.title.toLowerCase()} — ${top.description.split('.')[0].toLowerCase()}.`
    : `Analysis of ${analysisData.fileName} is complete.`;

  return { findings: findings.slice(0, 7), summary };
}

module.exports = { generateDashboard, generateInsights };
