const Papa = require('papaparse');
const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

// ─── File Parsing ─────────────────────────────────────────────────────────────
function parseFile(filePath, originalName) {
  const ext = path.extname(originalName).toLowerCase();

  if (ext === '.csv') {
    const content = fs.readFileSync(filePath, 'utf8');
    const result = Papa.parse(content, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: false, // we type-check ourselves for accurate issue detection
    });
    return { rows: result.data, fields: result.meta.fields || [] };
  }

  if (ext === '.xlsx' || ext === '.xls') {
    const workbook = XLSX.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const json = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false });
    const fields = json.length > 0 ? Object.keys(json[0]) : [];
    return { rows: json, fields };
  }

  throw new Error('Unsupported file type. Please upload CSV or Excel files.');
}

// ─── Type Detection ───────────────────────────────────────────────────────────
const DATE_PATTERNS = [
  /^\d{4}-\d{2}-\d{2}$/,        // YYYY-MM-DD
  /^\d{2}\/\d{2}\/\d{4}$/,      // MM/DD/YYYY
  /^\d{2}-\d{2}-\d{4}$/,        // MM-DD-YYYY
  /^\d{1,2}\/\d{1,2}\/\d{2,4}$/,// M/D/YY or M/D/YYYY
  /^\d{4}\/\d{2}\/\d{2}$/,      // YYYY/MM/DD
];

function isBlank(v) {
  return v === undefined || v === null || v === '' || (typeof v === 'string' && v.trim() === '') ||
    (typeof v === 'string' && ['na', 'n/a', 'null', 'none', '-', '?'].includes(v.trim().toLowerCase()));
}

function isNumeric(v) {
  if (isBlank(v)) return false;
  const cleaned = String(v).replace(/[$,%\s]/g, '');
  return cleaned !== '' && !isNaN(cleaned) && isFinite(cleaned);
}

function isDateLike(v) {
  if (isBlank(v)) return false;
  const s = String(v).trim();
  if (DATE_PATTERNS.some(p => p.test(s))) return true;
  const parsed = Date.parse(s);
  return !isNaN(parsed) && s.length >= 6;
}

function detectDateFormat(v) {
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return 'YYYY-MM-DD';
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) return 'MM/DD/YYYY';
  if (/^\d{2}-\d{2}-\d{4}$/.test(s)) return 'MM-DD-YYYY';
  if (/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(s)) return 'M/D/YY(YY)';
  if (/^\d{4}\/\d{2}\/\d{2}$/.test(s)) return 'YYYY/MM/DD';
  return 'other';
}

function inferColumnType(values) {
  const nonBlank = values.filter(v => !isBlank(v));
  if (nonBlank.length === 0) return 'empty';

  const numericCount = nonBlank.filter(isNumeric).length;
  const dateCount = nonBlank.filter(isDateLike).length;

  if (numericCount / nonBlank.length >= 0.9) {
    const allInts = nonBlank.filter(isNumeric).every(v => Number.isInteger(parseFloat(String(v).replace(/[$,%\s]/g, ''))));
    return allInts ? 'integer' : 'float';
  }
  if (dateCount / nonBlank.length >= 0.85) return 'date';

  const uniqueRatio = new Set(nonBlank.map(String)).size / nonBlank.length;
  if (uniqueRatio < 0.5 && nonBlank.length > 10) return 'categorical';

  return 'string';
}

// ─── Stats helpers ────────────────────────────────────────────────────────────
function toNum(v) {
  return parseFloat(String(v).replace(/[$,%\s]/g, ''));
}

function mean(arr) { return arr.reduce((a, b) => a + b, 0) / (arr.length || 1); }

function stddev(arr) {
  const m = mean(arr);
  return Math.sqrt(mean(arr.map(v => (v - m) ** 2)));
}

function median(arr) {
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function percentile(arr, p) {
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx), hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

// IQR-based outlier bounds — more robust than z-score on skewed, non-normal data
// (which is the common case for revenue, prices, durations, etc.)
function iqrBounds(arr) {
  const q1 = percentile(arr, 25);
  const q3 = percentile(arr, 75);
  const iqr = q3 - q1;
  return { lower: q1 - 1.5 * iqr, upper: q3 + 1.5 * iqr, q1, q3, iqr };
}

// ─── Main Analysis ────────────────────────────────────────────────────────────
function analyzeDataset(filePath, originalName) {
  const { rows, fields } = parseFile(filePath, originalName);

  if (!rows.length || !fields.length) {
    throw new Error('The file appears to be empty or could not be read.');
  }

  const totalRows = rows.length;
  const columnStats = [];
  const issues = [];
  let issueId = 1;

  fields.forEach(field => {
    const rawValues = rows.map(r => r[field]);
    const blanks = rawValues.filter(isBlank).length;
    const type = inferColumnType(rawValues);

    const stat = { name: field, type, nulls: blanks };

    // ── Missing values issue ──
    if (blanks > 0) {
      const pct = ((blanks / totalRows) * 100).toFixed(1);
      let recommendation, impact;
      if (type === 'integer' || type === 'float') {
        const nums = rawValues.filter(isNumeric).map(toNum);
        const med = nums.length ? median(nums) : 0;
        recommendation = `Replace missing values with the column median (${med.toLocaleString(undefined, { maximumFractionDigits: 2 })})`;
        impact = 'Preserves distribution shape better than mean imputation';
      } else if (type === 'categorical' || type === 'string') {
        const counts = {};
        rawValues.filter(v => !isBlank(v)).forEach(v => { counts[v] = (counts[v] || 0) + 1; });
        const mode = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
        recommendation = mode ? `Replace missing values with the most frequent value ("${mode[0]}")` : 'Remove rows with missing values';
        impact = 'Maintains categorical distribution integrity';
      } else {
        recommendation = 'Remove rows with missing values, or flag as "Unknown"';
        impact = 'Prevents downstream parsing errors';
      }
      issues.push({
        id: issueId++,
        type: 'missing_values',
        severity: pct > 20 ? 'high' : pct > 5 ? 'medium' : 'low',
        column: field,
        count: blanks,
        description: `Missing values detected in ${field} column (${pct}% of rows)`,
        recommendation,
        impact,
        action: 'fill_missing',
      });
    }

    // ── Numeric stats + outliers ──
    if (type === 'integer' || type === 'float') {
      const nums = rawValues.filter(isNumeric).map(toNum);
      if (nums.length > 0) {
        stat.min = Math.min(...nums);
        stat.max = Math.max(...nums);
        stat.mean = Math.round(mean(nums) * 100) / 100;

        if (nums.length >= 8) {
          const { lower, upper, q1, q3 } = iqrBounds(nums);
          const outliers = nums.filter(v => v < lower || v > upper);
          if (outliers.length > 0) {
            const pctOutlier = (outliers.length / nums.length) * 100;
            issues.push({
              id: issueId++,
              type: 'outliers',
              severity: pctOutlier > 8 ? 'high' : pctOutlier > 3 ? 'medium' : 'low',
              column: field,
              count: outliers.length,
              description: `${outliers.length} value${outliers.length === 1 ? '' : 's'} in ${field} fall outside the expected range (1.5×IQR beyond Q1=${q1.toLocaleString(undefined, { maximumFractionDigits: 2 })} / Q3=${q3.toLocaleString(undefined, { maximumFractionDigits: 2 })})`,
              recommendation: `Cap outlier values to the range ${lower.toLocaleString(undefined, { maximumFractionDigits: 2 })}–${upper.toLocaleString(undefined, { maximumFractionDigits: 2 })}, or review them individually if they may be valid extreme cases`,
              impact: 'Prevents a small number of extreme values from distorting averages and trend lines',
              action: 'cap_outliers',
            });
          }
        }
      }

      // type mismatch: numeric column with stray non-numeric values
      const nonBlankNonNumeric = rawValues.filter(v => !isBlank(v) && !isNumeric(v));
      if (nonBlankNonNumeric.length > 0 && nonBlankNonNumeric.length < rawValues.length * 0.5) {
        issues.push({
          id: issueId++,
          type: 'type_mismatch',
          severity: 'low',
          column: field,
          count: nonBlankNonNumeric.length,
          description: `${nonBlankNonNumeric.length} non-numeric value${nonBlankNonNumeric.length === 1 ? '' : 's'} found in numeric column ${field}`,
          recommendation: 'Convert invalid entries to null, or correct them to valid numbers',
          impact: 'Enables consistent numeric operations and accurate aggregation on this column',
          action: 'fix_types',
        });
      }

      // implausible negative values in fields that should logically be non-negative
      if (/age|price|salary|revenue|cost|amount|quantity|qty|units|count|duration|distance|weight|height|score/i.test(field)) {
        const nums2 = rawValues.filter(isNumeric).map(toNum);
        const negatives = nums2.filter(v => v < 0);
        if (negatives.length > 0) {
          issues.push({
            id: issueId++,
            type: 'invalid_value',
            severity: negatives.length > totalRows * 0.05 ? 'medium' : 'low',
            column: field,
            count: negatives.length,
            description: `${negatives.length} negative value${negatives.length === 1 ? '' : 's'} found in ${field}, which is not expected to go below zero`,
            recommendation: 'Review these rows for data entry errors and correct or remove invalid negative values',
            impact: 'Prevents impossible values from skewing totals and averages',
            action: 'fix_negative',
          });
        }
      }
    }

    // ── Date format consistency ──
    if (type === 'date') {
      const dateVals = rawValues.filter(isDateLike);
      const formats = new Set(dateVals.map(detectDateFormat));
      if (formats.size > 1) {
        const counts = {};
        dateVals.forEach(v => { const f = detectDateFormat(v); counts[f] = (counts[f] || 0) + 1; });
        const minorityCount = dateVals.length - Math.max(...Object.values(counts));
        issues.push({
          id: issueId++,
          type: 'format',
          severity: 'low',
          column: field,
          count: minorityCount,
          description: `Inconsistent date formats found in ${field} (${[...formats].join(', ')})`,
          recommendation: 'Standardize all dates to ISO 8601 format (YYYY-MM-DD)',
          impact: 'Enables accurate time-series analysis and sorting',
          action: 'standardize_dates',
        });
      }
    }

    // ── Categorical / string unique counts ──
    if (type === 'categorical' || type === 'string') {
      stat.unique = new Set(rawValues.filter(v => !isBlank(v)).map(String)).size;

      // Casing/whitespace inconsistency: same value appears under different casing or padding
      const nonBlankStrings = rawValues.filter(v => !isBlank(v)).map(v => String(v));
      const normalizedGroups = {};
      nonBlankStrings.forEach(v => {
        const norm = v.trim().toLowerCase();
        if (!normalizedGroups[norm]) normalizedGroups[norm] = new Set();
        normalizedGroups[norm].add(v);
      });
      const inconsistentGroups = Object.values(normalizedGroups).filter(variants => variants.size > 1);
      if (inconsistentGroups.length > 0) {
        const affectedCount = inconsistentGroups.reduce((sum, variants) => {
          return sum + nonBlankStrings.filter(v => variants.has(v)).length;
        }, 0);
        const examples = inconsistentGroups.slice(0, 2).map(v => [...v].join(' / ')).join(', ');
        issues.push({
          id: issueId++,
          type: 'inconsistent_text',
          severity: 'low',
          column: field,
          count: affectedCount,
          description: `Inconsistent capitalization or spacing in ${field} (e.g. ${examples}) — likely the same value entered differently`,
          recommendation: 'Standardize text casing and trim extra whitespace so identical values are treated as one category',
          impact: 'Prevents the same category from being split into multiple groups during analysis',
          action: 'standardize_text',
        });
      }
    }
    if (type === 'date') {
      stat.unique = new Set(rawValues.filter(v => !isBlank(v)).map(String)).size;
    }

    // ── Constant column: no analytical value ──
    const nonBlankCount = totalRows - blanks;
    if (nonBlankCount > 5 && stat.unique === 1) {
      issues.push({
        id: issueId++,
        type: 'constant_column',
        severity: 'low',
        column: field,
        count: nonBlankCount,
        description: `${field} contains the same value in every row`,
        recommendation: 'Consider removing this column — it carries no distinguishing information for analysis',
        impact: 'Simplifies the dataset without losing analytical signal',
        action: 'drop_constant',
      });
    }

    columnStats.push(stat);
  });

  // ── Duplicate rows ──
  const seen = new Map();
  let duplicateCount = 0;
  rows.forEach(row => {
    const key = JSON.stringify(fields.map(f => row[f]));
    seen.set(key, (seen.get(key) || 0) + 1);
  });
  seen.forEach(count => { if (count > 1) duplicateCount += count - 1; });

  if (duplicateCount > 0) {
    issues.push({
      id: issueId++,
      type: 'duplicates',
      severity: duplicateCount > totalRows * 0.05 ? 'medium' : 'low',
      column: 'All columns',
      count: duplicateCount,
      description: 'Duplicate records found across the dataset',
      recommendation: 'Remove duplicate rows, keeping the first occurrence',
      impact: 'Eliminates redundancy and prevents skewed aggregations',
      action: 'remove_duplicates',
    });
  }

  // ── High correlation between numeric columns (for transform suggestions) ──
  const numericCols = columnStats.filter(c => c.type === 'integer' || c.type === 'float').map(c => c.name);
  const correlatedPairs = [];
  for (let i = 0; i < numericCols.length; i++) {
    for (let j = i + 1; j < numericCols.length; j++) {
      const a = rows.map(r => toNum(r[numericCols[i]])).filter(v => !isNaN(v));
      const b = rows.map(r => toNum(r[numericCols[j]])).filter(v => !isNaN(v));
      const n = Math.min(a.length, b.length);
      if (n < 8) continue;
      const r = pearsonCorrelation(a.slice(0, n), b.slice(0, n));
      if (Math.abs(r) > 0.75) correlatedPairs.push({ a: numericCols[i], b: numericCols[j], r: Math.round(r * 100) / 100 });
    }
  }

  // ── Health score calculation ──
  // Weighted blend of four pillars: completeness, uniqueness (duplicates), validity (outliers/negatives/types), consistency (formats/casing)
  const totalCells = totalRows * fields.length;
  const totalNulls = columnStats.reduce((s, c) => s + (c.nulls || 0), 0);
  const completeness = totalCells > 0 ? 1 - (totalNulls / totalCells) : 1;

  const dupPenalty = Math.min(1, duplicateCount / totalRows);

  const outlierCount = issues.filter(i => i.type === 'outliers').reduce((s, i) => s + i.count, 0);
  const negativeCount = issues.filter(i => i.type === 'invalid_value').reduce((s, i) => s + i.count, 0);
  const typeMismatchCount = issues.filter(i => i.type === 'type_mismatch').reduce((s, i) => s + i.count, 0);
  const validityPenalty = Math.min(1, (outlierCount + negativeCount + typeMismatchCount) / totalRows);

  const formatIssueCount = issues.filter(i => i.type === 'format' || i.type === 'inconsistent_text' || i.type === 'constant_column').length;
  const consistencyPenalty = Math.min(1, formatIssueCount * 0.08);

  const pillars = {
    completeness: Math.round(completeness * 100),
    uniqueness: Math.round((1 - dupPenalty) * 100),
    validity: Math.round((1 - validityPenalty) * 100),
    consistency: Math.round((1 - consistencyPenalty) * 100),
  };

  let healthScore = Math.round(
    pillars.completeness * 0.40 +
    pillars.uniqueness * 0.25 +
    pillars.validity * 0.20 +
    pillars.consistency * 0.15
  );
  healthScore = Math.max(15, Math.min(100, healthScore));

  // ── Transformation suggestions ──
  const transformationSuggestions = [];
  let tId = 1;

  const categoricalCols = columnStats.filter(c => c.type === 'categorical').map(c => c.name);
  if (categoricalCols.length > 0) {
    transformationSuggestions.push({
      id: tId++,
      type: 'encode',
      description: `One-hot encode categorical columns: ${categoricalCols.slice(0, 3).join(', ')}${categoricalCols.length > 3 ? '...' : ''}`,
      reason: 'Categorical variables need numeric encoding for most ML models',
      columns: categoricalCols.slice(0, 4),
    });
  }

  if (numericCols.length >= 2) {
    const highVarianceCols = columnStats.filter(c => (c.type === 'integer' || c.type === 'float') && c.max && c.min && (c.max - c.min) > 1000).map(c => c.name);
    if (highVarianceCols.length > 0) {
      transformationSuggestions.push({
        id: tId++,
        type: 'normalize',
        description: `Normalize high-variance numeric columns: ${highVarianceCols.slice(0, 3).join(', ')}`,
        reason: 'Large scale differences between numeric features can bias model training',
        columns: highVarianceCols.slice(0, 4),
      });
    }
  }

  correlatedPairs.slice(0, 2).forEach(pair => {
    transformationSuggestions.push({
      id: tId++,
      type: 'drop',
      description: `Consider removing one of the highly correlated columns (r=${pair.r})`,
      reason: `${pair.a} and ${pair.b} show strong correlation, indicating possible redundancy`,
      columns: [pair.a, pair.b],
    });
  });

  if (numericCols.length >= 2 && transformationSuggestions.length < 4) {
    transformationSuggestions.push({
      id: tId++,
      type: 'feature_engineering',
      description: `Create a derived ratio feature from ${numericCols[0]} and ${numericCols[1]}`,
      reason: 'Combining related numeric fields can surface additional analytical signal',
      columns: [numericCols[0], numericCols[1]],
    });
  }

  if (transformationSuggestions.length === 0) {
    transformationSuggestions.push({
      id: tId++,
      type: 'normalize',
      description: 'Dataset structure looks clean — no major transformations required',
      reason: 'No significant scale, correlation, or encoding issues detected',
      columns: [],
    });
  }

  return {
    fileName: originalName,
    rows: totalRows,
    columns: fields.length,
    healthScore,
    healthPillars: pillars,
    issues,
    columnStats,
    transformationSuggestions,
    fields,
    numericCols,
    categoricalCols,
    rawSample: rows.slice(0, 500), // capped sample retained for dashboard/insight generation
    fullRows: rows, // complete dataset retained server-side only, for accurate cleaning/export
  };
}

function pearsonCorrelation(a, b) {
  const n = a.length;
  const ma = mean(a), mb = mean(b);
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < n; i++) {
    num += (a[i] - ma) * (b[i] - mb);
    da += (a[i] - ma) ** 2;
    db += (b[i] - mb) ** 2;
  }
  const denom = Math.sqrt(da * db);
  return denom === 0 ? 0 : num / denom;
}

// ─── Apply real cleaning operations to the dataset based on accepted issues ──
// Returns a new array of cleaned rows. Each issue carries an `action` describing
// what to do; this function actually performs that action on the row data,
// rather than just simulating a health-score bump.
function applyCleaning(rawRows, fields, issues, acceptedIds) {
  let rows = rawRows.map(r => ({ ...r }));
  const accepted = issues.filter(i => acceptedIds.includes(String(i.id)) || acceptedIds.includes(i.id));

  accepted.forEach(issue => {
    const col = issue.column;

    switch (issue.action) {
      case 'fill_missing': {
        const nonBlank = rows.map(r => r[col]).filter(v => !isBlank(v));
        const allNumeric = nonBlank.length > 0 && nonBlank.every(isNumeric);
        let fillValue;
        if (allNumeric) {
          fillValue = median(nonBlank.map(toNum));
        } else {
          const counts = {};
          nonBlank.forEach(v => { counts[v] = (counts[v] || 0) + 1; });
          const mode = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
          fillValue = mode ? mode[0] : 'Unknown';
        }
        rows.forEach(r => { if (isBlank(r[col])) r[col] = fillValue; });
        break;
      }

      case 'remove_duplicates': {
        const seen = new Set();
        rows = rows.filter(r => {
          const key = JSON.stringify(fields.map(f => r[f]));
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
        break;
      }

      case 'cap_outliers': {
        const nums = rows.map(r => toNum(r[col])).filter(v => !isNaN(v));
        if (nums.length >= 8) {
          const { lower, upper } = iqrBounds(nums);
          rows.forEach(r => {
            const v = toNum(r[col]);
            if (!isNaN(v)) {
              if (v < lower) r[col] = lower;
              else if (v > upper) r[col] = upper;
            }
          });
        }
        break;
      }

      case 'standardize_dates': {
        rows.forEach(r => {
          const v = r[col];
          if (isBlank(v)) return;
          const d = new Date(v);
          if (!isNaN(d.getTime())) {
            r[col] = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
          }
        });
        break;
      }

      case 'fix_types': {
        rows.forEach(r => {
          const v = r[col];
          if (!isBlank(v) && !isNumeric(v)) r[col] = '';
        });
        break;
      }

      case 'fix_negative': {
        rows.forEach(r => {
          const v = toNum(r[col]);
          if (!isNaN(v) && v < 0) r[col] = Math.abs(v);
        });
        break;
      }

      case 'standardize_text': {
        // Normalize to the most common casing variant for each lowercase/trimmed key
        const variantCounts = {};
        rows.forEach(r => {
          const v = r[col];
          if (isBlank(v)) return;
          const norm = String(v).trim().toLowerCase();
          variantCounts[norm] = variantCounts[norm] || {};
          variantCounts[norm][v] = (variantCounts[norm][v] || 0) + 1;
        });
        const canonical = {};
        Object.entries(variantCounts).forEach(([norm, variants]) => {
          canonical[norm] = Object.entries(variants).sort((a, b) => b[1] - a[1])[0][0];
        });
        rows.forEach(r => {
          const v = r[col];
          if (isBlank(v)) return;
          const norm = String(v).trim().toLowerCase();
          if (canonical[norm]) r[col] = canonical[norm];
        });
        break;
      }

      case 'drop_constant': {
        // Column carries no signal — remove it entirely from every row
        rows.forEach(r => { delete r[col]; });
        break;
      }

      default:
        break; // unknown action: leave data untouched
    }
  });

  const remainingFields = fields.filter(f => rows.length === 0 || Object.prototype.hasOwnProperty.call(rows[0], f));
  return { rows, fields: remainingFields };
}

module.exports = { analyzeDataset, applyCleaning, toNum, isBlank, isNumeric, mean, median, stddev, percentile, iqrBounds, pearsonCorrelation };
