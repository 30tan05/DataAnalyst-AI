const express = require('express');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const { analyzeDataset, applyCleaning } = require('./dataEngine');
const { generateDashboard, generateInsights } = require('./insightsEngine');
const { buildCleanedCsv, buildCleanedXlsx, buildDashboardPdf, buildInsightsPdf, buildPresentationPptx } = require('./exportEngine');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

const upload = multer({ dest: 'uploads/', limits: { fileSize: 100 * 1024 * 1024 } });

if (!fs.existsSync('uploads')) fs.mkdirSync('uploads');

const sessions = new Map();

function getSession(req) {
  const id = req.headers['x-session-id'] || 'default';
  if (!sessions.has(id)) sessions.set(id, {});
  return sessions.get(id);
}

app.post('/api/analyze', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  const filePath = req.file.path;
  const fileName = req.file.originalname;

  try {
    const analysis = analyzeDataset(filePath, fileName);
    const session = getSession(req);
    session.analysis = analysis;
    session.healthScore = analysis.healthScore;

    const { rawSample, fullRows, ...clientPayload } = analysis;
    res.json(clientPayload);
  } catch (err) {
    res.status(400).json({ error: err.message || 'Failed to analyze file. Please check the file format.' });
  } finally {
    fs.unlink(filePath, () => {});
  }
});

app.post('/api/apply-recommendations', (req, res) => {
  const { accepted } = req.body;
  const session = getSession(req);

  if (!session.analysis) {
    return res.status(400).json({ error: 'No active analysis session. Please upload a file first.' });
  }

  const acceptedIds = (accepted || []).map(String);
  const acceptedIssues = (session.analysis.issues || []).filter(i => acceptedIds.includes(String(i.id)));

  // Actually apply the cleaning operations to the full dataset
  const { rows: cleanedRows, fields: cleanedFields } = applyCleaning(
    session.analysis.fullRows,
    session.analysis.fields,
    session.analysis.issues,
    acceptedIds
  );
  session.cleanedRows = cleanedRows;
  session.cleanedFields = cleanedFields;

  const totalIssues = session.analysis.issues?.length || 1;
  const improvementPerIssue = (100 - session.analysis.healthScore) / totalIssues;
  const newScore = Math.min(99, Math.round(session.analysis.healthScore + acceptedIssues.length * improvementPerIssue * 0.8));

  session.healthScore = newScore;

  res.json({
    success: true,
    newHealthScore: newScore,
    rowsRemaining: cleanedRows.length,
    message: `Applied ${acceptedIssues.length} recommendation${acceptedIssues.length === 1 ? '' : 's'} successfully.`,
  });
});

app.post('/api/generate-dashboard', (req, res) => {
  const { dashboardType, chartPrefs } = req.body;
  const session = getSession(req);

  if (!session.analysis) {
    return res.status(400).json({ error: 'No active analysis session. Please upload a file first.' });
  }

  try {
    const dashboard = generateDashboard(session.analysis, dashboardType, chartPrefs || {});
    session.lastDashboard = dashboard;
    session.lastDashboardType = dashboardType;
    res.json(dashboard);
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate dashboard from this dataset.' });
  }
});

app.get('/api/insights', (req, res) => {
  const session = getSession(req);

  if (!session.analysis) {
    return res.status(400).json({ error: 'No active analysis session. Please upload a file first.' });
  }

  try {
    const insights = generateInsights({ ...session.analysis, healthScore: session.healthScore || session.analysis.healthScore });
    session.lastInsights = insights;
    res.json(insights);
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate insights from this dataset.' });
  }
});

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

// ── Export: Cleaned Dataset ──
app.get('/api/export/dataset', (req, res) => {
  const session = getSession(req);
  if (!session.analysis) {
    return res.status(400).json({ error: 'No active analysis session. Please upload a file first.' });
  }

  const format = (req.query.format || 'csv').toLowerCase();
  // Use the cleaned dataset if recommendations were applied, otherwise fall back to the original
  const rows = session.cleanedRows || session.analysis.fullRows;
  const fields = session.cleanedFields || session.analysis.fields;
  const baseName = (session.analysis.fileName || 'dataset').replace(/\.[^/.]+$/, '');

  try {
    if (format === 'xlsx') {
      const buffer = buildCleanedXlsx(rows, fields);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${baseName}_cleaned.xlsx"`);
      res.send(buffer);
    } else {
      const csv = buildCleanedCsv(rows, fields);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${baseName}_cleaned.csv"`);
      res.send(csv);
    }
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate the dataset export.' });
  }
});

// ── Export: Dashboard Report PDF ──
app.get('/api/export/dashboard-pdf', async (req, res) => {
  const session = getSession(req);
  if (!session.analysis || !session.lastDashboard) {
    return res.status(400).json({ error: 'Generate a dashboard first before exporting it.' });
  }

  try {
    const buffer = await buildDashboardPdf({
      fileName: session.analysis.fileName,
      healthScore: session.healthScore || session.analysis.healthScore,
      dashboardType: session.lastDashboardType,
      kpis: session.lastDashboard.kpis,
      categoryBreakdown: session.lastDashboard.categoryBreakdown,
      valueColumn: session.lastDashboard.valueColumn,
      categoryColumn: session.lastDashboard.categoryColumn,
    });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="dashboard_report.pdf"');
    res.send(buffer);
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate the dashboard PDF.' });
  }
});

// ── Export: AI Insights PDF ──
app.get('/api/export/insights-pdf', async (req, res) => {
  const session = getSession(req);
  if (!session.analysis || !session.lastInsights) {
    return res.status(400).json({ error: 'Generate AI insights first before exporting them.' });
  }

  try {
    const buffer = await buildInsightsPdf({
      fileName: session.analysis.fileName,
      summary: session.lastInsights.summary,
      findings: session.lastInsights.findings,
    });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="ai_insights_report.pdf"');
    res.send(buffer);
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate the insights PDF.' });
  }
});

// ── Export: Presentation Deck (PPTX) ──
app.get('/api/export/presentation', async (req, res) => {
  const session = getSession(req);
  if (!session.analysis || !session.lastDashboard || !session.lastInsights) {
    return res.status(400).json({ error: 'Generate a dashboard and AI insights first before exporting a presentation.' });
  }

  try {
    const buffer = await buildPresentationPptx({
      fileName: session.analysis.fileName,
      healthScore: session.healthScore || session.analysis.healthScore,
      kpis: session.lastDashboard.kpis,
      findings: session.lastInsights.findings,
      dashboardType: session.lastDashboardType,
    });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.presentationml.presentation');
    res.setHeader('Content-Disposition', 'attachment; filename="presentation_deck.pptx"');
    res.send(buffer);
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate the presentation deck.' });
  }
});

app.listen(PORT, () => {
  console.log(`DataAnalyst AI backend running on port ${PORT}`);
});
