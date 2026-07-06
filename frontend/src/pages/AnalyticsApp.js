import React, { useState, useCallback, useRef } from 'react';
import { useDropzone } from 'react-dropzone';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  AreaChart, Area, ScatterChart, Scatter,
} from 'recharts';
import {
  FolderOpen, Search, Repeat, MapPin, CalendarDays, Type, HelpCircle,
  Brain, TrendingUp, TrendingDown, AlertTriangle, GitBranch, BarChart2,
  CheckCircle2, XCircle, Pencil, ArrowRight, ArrowLeft, FileText, FileSpreadsheet,
  Presentation, Lightbulb, Briefcase, FlaskConical, Settings, BookOpen, Lock,
  Loader2, AlertCircle, SlidersHorizontal, RefreshCw, Award,
  ShieldCheck, ShieldAlert, Hash, Layers,
} from 'lucide-react';
import ThemeToggle from '../components/ThemeToggle';
import { useTheme } from '../ThemeContext';
import './AnalyticsApp.css';

const API = "https://dataanalyst-ai-backend.onrender.com/api";

const SESSION_ID = `session-${Math.random().toString(36).slice(2)}-${Date.now()}`;

const api = axios.create({
  baseURL: API,
  headers: {
    "x-session-id": SESSION_ID,
  },
});

// ─── Theme-resolved chart colors (Recharts SVG attrs don't reliably read CSS vars) ──
const CHART_THEME = {
  dark: {
    grid: 'rgba(255,255,255,0.08)',
    axis: '#9999bb',
    tooltipBg: '#181832',
    tooltipBorder: 'rgba(99,102,241,0.4)',
    tooltipText: '#f0f0ff',
    legendText: '#a0a0c0',
    pieStroke: '#05050f',
  },
  light: {
    grid: 'rgba(20,20,43,0.08)',
    axis: '#5d5d80',
    tooltipBg: '#ffffff',
    tooltipBorder: 'rgba(79,70,229,0.3)',
    tooltipText: '#14142b',
    legendText: '#4a4a68',
    pieStroke: '#ffffff',
  },
};

function useChartTheme() {
  const { theme } = useTheme();
  return CHART_THEME[theme] || CHART_THEME.dark;
}

// ─── Severity Badge ───────────────────────────────────────────────────────────
function SeverityBadge({ severity }) {
  const map = { high: 'badge-rose', medium: 'badge-amber', low: 'badge-cyan' };
  return <span className={`badge ${map[severity] || 'badge-violet'}`}>{severity}</span>;
}

// ─── Health Score Ring ────────────────────────────────────────────────────────
function HealthRing({ score }) {
  const r = 54;
  const circ = 2 * Math.PI * r;
  const offset = circ - (score / 100) * circ;
  const color = score >= 85 ? 'var(--accent-emerald)' : score >= 65 ? 'var(--accent-amber)' : 'var(--accent-rose)';

  return (
    <div className="health-ring-wrap">
      <svg width="140" height="140" viewBox="0 0 140 140">
        <circle cx="70" cy="70" r={r} fill="none" stroke="var(--border)" strokeWidth="12" />
        <circle
          cx="70" cy="70" r={r}
          fill="none" stroke={color} strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          transform="rotate(-90 70 70)"
          style={{ transition: 'stroke-dashoffset 1.5s ease' }}
        />
      </svg>
      <div className="health-ring-label">
        <div className="health-score font-display" style={{ color }}>{score}</div>
        <div className="health-sub">/ 100</div>
      </div>
    </div>
  );
}

const ISSUE_ICONS = {
  missing_values: AlertTriangle,
  duplicates: Repeat,
  outliers: MapPin,
  format: CalendarDays,
  type_mismatch: Type,
  invalid_value: ShieldAlert,
  inconsistent_text: Type,
  constant_column: Hash,
};

// ─── Health Pillars (professional breakdown) ─────────────────────────────────
function HealthPillars({ pillars }) {
  if (!pillars) return null;
  const items = [
    { key: 'completeness', label: 'Completeness', desc: 'How much data is filled in vs. missing' },
    { key: 'uniqueness', label: 'Uniqueness', desc: 'Absence of duplicate records' },
    { key: 'validity', label: 'Validity', desc: 'Values fall within expected ranges and types' },
    { key: 'consistency', label: 'Consistency', desc: 'Uniform formatting across similar values' },
  ];
  return (
    <div className="pillars-grid">
      {items.map(item => {
        const val = pillars[item.key] ?? 100;
        const color = val >= 90 ? 'var(--accent-emerald)' : val >= 70 ? 'var(--accent-amber)' : 'var(--accent-rose)';
        return (
          <div key={item.key} className="pillar-item" title={item.desc}>
            <div className="pillar-header">
              <span className="pillar-label">{item.label}</span>
              <span className="pillar-value" style={{ color }}>{val}%</span>
            </div>
            <div className="pillar-bar">
              <div className="pillar-fill" style={{ width: `${val}%`, background: color }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Issue Card ───────────────────────────────────────────────────────────────
function IssueCard({ issue, status, onAccept, onReject}) {
  const Icon = ISSUE_ICONS[issue.type] || HelpCircle;

  return (
    <div className={`issue-card ${status}`}>
      <div className="issue-header">
        <div className="issue-type-icon"><Icon size={20} strokeWidth={1.8} /></div>
        <div className="issue-info">
          <div className="issue-title">{issue.description}</div>
          <div className="issue-meta">
            <span className="font-mono issue-col">{issue.column}</span>
            <span className="issue-count">{issue.count} affected</span>
            <SeverityBadge severity={issue.severity} />
          </div>
        </div>
        {status === 'accepted' && <div className="status-chip accepted"><CheckCircle2 size={13} /> Accepted</div>}
        {status === 'rejected' && <div className="status-chip rejected"><XCircle size={13} /> Rejected</div>}
      </div>
      <div className="issue-rec">
        <div className="rec-label">Recommended fix</div>
        <div className="rec-text">{issue.recommendation}</div>
        <div className="rec-impact">Expected impact: {issue.impact}</div>
      </div>
      {status === 'pending' && (
        <div className="issue-actions">
          <button className="btn-accept" onClick={() => onAccept(issue.id)}><CheckCircle2 size={14} /> Accept</button>
         
          <button className="btn-reject" onClick={() => onReject(issue.id)}><XCircle size={14} /> Reject</button>
        </div>
      )}
    </div>
  );
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────
function KpiCard({ label, value, change, trend }) {
  const isUp = trend === 'up';
  return (
    <div className="kpi-card card">
      <div className="kpi-label">{label}</div>
      <div className="kpi-value font-display">{value}</div>
      {change && (
        <div className={`kpi-change ${isUp ? 'up' : 'down'}`}>
          {isUp ? <TrendingUp size={14} /> : <TrendingDown size={14} />} {change}
        </div>
      )}
    </div>
  );
}

const INSIGHT_ICONS = {
  trend: TrendingUp, regional: MapPin, retention: Award,
  anomaly: AlertTriangle, correlation: GitBranch, forecast: BarChart2,
};

// ─── Insight Card ─────────────────────────────────────────────────────────────
function InsightCard({ finding, index }) {
  const typeColors = {
    trend: 'var(--accent-violet)', regional: 'var(--accent-cyan)', retention: 'var(--accent-emerald)',
    anomaly: 'var(--accent-rose)', correlation: 'var(--accent-amber)', forecast: '#a78bfa',
  };
  const color = typeColors[finding.type] || 'var(--accent-violet)';
  const Icon = INSIGHT_ICONS[finding.type] || Lightbulb;

  return (
    <div className="insight-card" style={{ animationDelay: `${index * 100}ms` }}>
      <div className="insight-accent" style={{ background: color }} />
      <div className="insight-icon" style={{ color }}><Icon size={20} strokeWidth={1.8} /></div>
      <div className="insight-body">
        <div className="insight-title font-display">{finding.title}</div>
        <div className="insight-desc">{finding.description}</div>
        <div className="insight-footer">
          <span className="badge badge-violet">AI Confidence: {finding.confidence}%</span>
          <div className="confidence-bar">
            <div className="confidence-fill" style={{ width: `${finding.confidence}%`, background: color }} />
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Step Sidebar ─────────────────────────────────────────────────────────────
function StepSidebar({ current }) {
  const steps = [
    { id: 'upload', label: 'Upload' },
    { id: 'scan', label: 'Health Scan' },
    { id: 'clean', label: 'Clean Data' },
    { id: 'transform', label: 'Transform' },
    { id: 'dashboard', label: 'Dashboard Style' },
    { id: 'visualize', label: 'Visualizations' },
    { id: 'insights', label: 'AI Insights' },
    { id: 'export', label: 'Export' },
  ];

  const stepOrder = steps.map(s => s.id);
  const currentIdx = stepOrder.indexOf(current);

  return (
    <aside className="step-sidebar">
      <div className="sidebar-logo">
        <span style={{ color: 'var(--accent-violet)', fontSize: 20 }}>◈</span>
        <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 15 }}>
          DataAnalyst<span style={{ color: 'var(--accent-cyan)' }}>AI</span>
        </span>
      </div>
      <div className="sidebar-steps">
        {steps.map((s, i) => {
          const done = i < currentIdx;
          const active = s.id === current;
          return (
            <div key={s.id} className={`sidebar-step ${active ? 'active' : ''} ${done ? 'done' : ''}`}>
              <div className="step-dot">
                {done ? <CheckCircle2 size={13} /> : <span>{i + 1}</span>}
              </div>
              <span className="step-label">{s.label}</span>
              {i < steps.length - 1 && <div className="step-line" />}
            </div>
          );
        })}
      </div>
      <div className="sidebar-footer">
        <ThemeToggle />
      </div>
    </aside>
  );
}

const CHART_COLORS = ['#6366f1', '#06b6d4', '#10b981', '#f59e0b', '#f43f5e', '#a78bfa'];

function formatLabel(s) {
  if (!s) return '';
  return s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

// ─── Error Banner ─────────────────────────────────────────────────────────────
function ErrorBanner({ message }) {
  if (!message) return null;
  return (
    <div className="error-banner">
      <AlertCircle size={16} />
      <span>{message}</span>
    </div>
  );
}

// ─── Customize Panel — let the user choose which columns/chart types to use ──
function CustomizePanel({ dashboardData, chartPrefs, onApply, onClose }) {
  const [local, setLocal] = useState({
    categoryColumn: chartPrefs.categoryColumn || dashboardData.categoryColumn || '',
    valueColumn: chartPrefs.valueColumn || dashboardData.valueColumn || '',
    dateColumn: chartPrefs.dateColumn || dashboardData.dateColumn || '',
  });

  const { dateColumns = [], categoricalColumns = [], numericColumns = [] } = dashboardData.availableColumns || {};

  return (
    <div className="customize-panel card">
      <div className="customize-header">
        <SlidersHorizontal size={16} />
        <span className="font-display">Customize this dashboard</span>
      </div>
      <div className="customize-grid">
        <div className="customize-field">
          <label>Group by (category)</label>
          <select value={local.categoryColumn} onChange={e => setLocal(l => ({ ...l, categoryColumn: e.target.value }))}>
            {categoricalColumns.length === 0 && <option value="">No categorical columns found</option>}
            {categoricalColumns.map(c => <option key={c} value={c}>{formatLabel(c)}</option>)}
          </select>
        </div>
        <div className="customize-field">
          <label>Measure (value)</label>
          <select value={local.valueColumn} onChange={e => setLocal(l => ({ ...l, valueColumn: e.target.value }))}>
            {numericColumns.length === 0 && <option value="">No numeric columns found</option>}
            {numericColumns.map(c => <option key={c} value={c}>{formatLabel(c)}</option>)}
          </select>
        </div>
        {dateColumns.length > 0 && (
          <div className="customize-field">
            <label>Time axis (date)</label>
            <select value={local.dateColumn} onChange={e => setLocal(l => ({ ...l, dateColumn: e.target.value }))}>
              {dateColumns.map(c => <option key={c} value={c}>{formatLabel(c)}</option>)}
            </select>
          </div>
        )}
      </div>
      <div className="customize-actions">
        <button className="btn-primary" onClick={() => onApply(local)}><RefreshCw size={14} /> Regenerate Charts</button>
        <button className="btn-secondary" onClick={onClose}>Cancel</button>
      </div>
    </div>
  );
}

// ─── Dashboard View — renders a genuinely different layout per style ─────────
function DashboardView({ dashboardData, dashboardType, error, chartPrefs, showCustomize, setShowCustomize, onRegenerate, onContinue, onChangeStyle }) {
  const ct = useChartTheme();
  const tooltipStyle = { background: ct.tooltipBg, border: `1px solid ${ct.tooltipBorder}`, borderRadius: 8, color: ct.tooltipText, fontSize: 13 };
  const legendStyle = { fontSize: 12, color: ct.legendText };
  const tickStyle = { fontSize: 12, fill: ct.axis };

  const handleApplyCustomize = (prefs) => {
    onRegenerate(prefs);
    setShowCustomize(false);
  };

  const trendChart = dashboardData.hasTimeSeries && (
    <div className="chart-card card">
      <div className="chart-title font-display">{formatLabel(dashboardData.timeSeriesKeys?.[0])} Over Time</div>
      <ResponsiveContainer width="100%" height={280}>
        <AreaChart data={dashboardData.timeSeries} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#6366f1" stopOpacity={0.35} />
              <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke={ct.grid} />
          <XAxis dataKey="month" stroke={ct.axis} tick={tickStyle} />
          <YAxis stroke={ct.axis} tick={tickStyle} />
          <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: ct.tooltipText }} itemStyle={{ color: ct.tooltipText }} />
          <Area type="monotone" dataKey={dashboardData.timeSeriesKeys?.[0]} stroke="#6366f1" strokeWidth={2.5} fill="url(#revGrad)" name={formatLabel(dashboardData.timeSeriesKeys?.[0])} />
          {dashboardData.timeSeriesKeys?.[1] && (
            <Line type="monotone" dataKey={dashboardData.timeSeriesKeys[1]} stroke="#06b6d4" strokeWidth={2} dot={false} name={formatLabel(dashboardData.timeSeriesKeys[1])} />
          )}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );

  const pieChart = dashboardData.hasCategoryData && (
    <div className="chart-card card">
      <div className="chart-title font-display">{formatLabel(dashboardData.valueColumn)} by {formatLabel(dashboardData.categoryColumn)}</div>
      <ResponsiveContainer width="100%" height={280}>
        <PieChart>
          <Pie data={dashboardData.categoryBreakdown} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} strokeWidth={2} stroke={ct.pieStroke}>
            {dashboardData.categoryBreakdown?.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
          </Pie>
          <Tooltip contentStyle={tooltipStyle} itemStyle={{ color: ct.tooltipText }} />
          <Legend wrapperStyle={legendStyle} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );

  const categoryBarChart = dashboardData.hasCategoryData && (
    <div className="chart-card card">
      <div className="chart-title font-display">{formatLabel(dashboardData.categoryColumn)} Comparison</div>
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={dashboardData.categoryBreakdown} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={ct.grid} />
          <XAxis dataKey="name" stroke={ct.axis} tick={tickStyle} />
          <YAxis stroke={ct.axis} tick={tickStyle} />
          <Tooltip contentStyle={tooltipStyle} itemStyle={{ color: ct.tooltipText }} />
          <Bar dataKey="value" radius={[4, 4, 0, 0]} name={formatLabel(dashboardData.valueColumn)}>
            {dashboardData.categoryBreakdown?.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );

  const distributionChart = dashboardData.hasDistribution && (
    <div className="chart-card card">
      <div className="chart-title font-display">{formatLabel(dashboardData.valueColumn)} Distribution</div>
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={dashboardData.distribution} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={ct.grid} />
          <XAxis dataKey="range" stroke={ct.axis} tick={{ ...tickStyle, fontSize: 10 }} />
          <YAxis stroke={ct.axis} tick={tickStyle} />
          <Tooltip contentStyle={tooltipStyle} itemStyle={{ color: ct.tooltipText }} formatter={(v) => [v, 'Records']} />
          <Bar dataKey="count" fill="#06b6d4" radius={[4, 4, 0, 0]} name="Records" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );

  const scatterChart = dashboardData.hasScatter && (
    <div className="chart-card card">
      <div className="chart-title font-display">{formatLabel(dashboardData.valueColumn)} vs {formatLabel(dashboardData.secondaryValueColumn)}</div>
      <ResponsiveContainer width="100%" height={280}>
        <ScatterChart margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={ct.grid} />
          <XAxis dataKey="x" name={formatLabel(dashboardData.valueColumn)} stroke={ct.axis} tick={tickStyle} />
          <YAxis dataKey="y" name={formatLabel(dashboardData.secondaryValueColumn)} stroke={ct.axis} tick={tickStyle} />
          <Tooltip contentStyle={tooltipStyle} itemStyle={{ color: ct.tooltipText }} cursor={{ strokeDasharray: '3 3' }} />
          <Scatter data={dashboardData.scatterData} fill="#a78bfa" fillOpacity={0.7} />
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );

  const topEntitiesChart = dashboardData.topEntities?.length > 0 && (
    <div className="chart-card card full-width">
      <div className="chart-title font-display">Top {formatLabel(dashboardData.categoryColumn)} — {formatLabel(dashboardData.valueColumn)} vs Count</div>
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={dashboardData.topEntities} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={ct.grid} />
          <XAxis dataKey="name" stroke={ct.axis} tick={{ ...tickStyle, fontSize: 11 }} />
          <YAxis stroke={ct.axis} tick={tickStyle} />
          <Tooltip contentStyle={tooltipStyle} itemStyle={{ color: ct.tooltipText }} />
          <Legend wrapperStyle={legendStyle} />
          <Bar dataKey="revenue" fill="#6366f1" radius={[4, 4, 0, 0]} name={formatLabel(dashboardData.valueColumn)} />
          <Bar dataKey="units" fill="#06b6d4" radius={[4, 4, 0, 0]} name="Count" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );

  const noDataFallback = !dashboardData.hasTimeSeries && !dashboardData.hasCategoryData && !dashboardData.hasDistribution && (
    <div className="chart-card card full-width">
      <div className="chart-title font-display">Dataset Overview</div>
      <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
        This dataset doesn't contain a clear date or category column to chart automatically.
        Review the KPI cards above and the AI Insights for a breakdown of the numeric fields found.
      </p>
    </div>
  );

  let mainCharts;
  if (dashboardType === 'analytical') {
    mainCharts = (
      <>
        <div className="chart-grid">{distributionChart}{scatterChart || pieChart}</div>
        {topEntitiesChart}
      </>
    );
  } else if (dashboardType === 'operational') {
    mainCharts = (
      <>
        <div className="chart-grid">{categoryBarChart}{trendChart}</div>
        {topEntitiesChart}
      </>
    );
  } else if (dashboardType === 'storytelling') {
    mainCharts = (
      <>
        {trendChart}
        <div className="chart-grid">{pieChart}</div>
      </>
    );
  } else {
    mainCharts = (
      <>
        <div className="chart-grid">{trendChart}{pieChart}</div>
        {topEntitiesChart}
      </>
    );
  }

  return (
    <div className="app-section">
      <div className="app-section-header dashboard-header-row">
        <div>
          <div className="section-label">Phase 6 — Visualizations</div>
          <h1 className="app-title font-display">
            {dashboardType?.charAt(0).toUpperCase() + dashboardType?.slice(1)} Dashboard
          </h1>
          <p className="app-subtitle">Generated from your actual uploaded dataset</p>
        </div>
        <div className="dashboard-header-actions">
          <button className="btn-secondary" onClick={() => setShowCustomize(s => !s)}>
            <SlidersHorizontal size={14} /> Customize
          </button>
          <button className="btn-secondary" onClick={onChangeStyle}>
            <Layers size={14} /> Change Style
          </button>
        </div>
      </div>
      <ErrorBanner message={error} />

      {showCustomize && (
        <CustomizePanel
          dashboardData={dashboardData}
          chartPrefs={chartPrefs}
          onApply={handleApplyCustomize}
          onClose={() => setShowCustomize(false)}
        />
      )}

      <div className="kpi-row">
        {dashboardData.kpis?.map((k, i) => <KpiCard key={i} {...k} />)}
      </div>

      {mainCharts}
      {noDataFallback}

      <div className="section-actions">
        <button className="btn-primary" onClick={onContinue}>
          Discover AI Insights <ArrowRight size={16} />
        </button>
      </div>
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function AnalyticsApp() {
  const navigate = useNavigate();
  const [step, setStep] = useState('upload');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [analysisData, setAnalysisData] = useState(null);
  const [issueStatuses, setIssueStatuses] = useState({});
  const [healthScore, setHealthScore] = useState(null);
  const [selectedTransforms, setSelectedTransforms] = useState([]);
  const [dashboardType, setDashboardType] = useState(null);
  const [dashboardData, setDashboardData] = useState(null);
  const [insights, setInsights] = useState(null);
  const [uploadedFile, setUploadedFile] = useState(null);
  const [exportMsg, setExportMsg] = useState('');
  const fileRef = useRef(null);

  // ── Upload ──
  const handleFile = useCallback(async (file) => {
    if (!file) return;
    fileRef.current = file;
    setUploadedFile(file);
    setError('');
    setLoading(true);
    setStep('scan');

    try {
      const form = new FormData();
      form.append('file', file);
      const res = await api.post('/analyze', form);
      setAnalysisData(res.data);
      setHealthScore(res.data.healthScore);
      const statuses = {};
      (res.data.issues || []).forEach(i => { statuses[i.id] = 'pending'; });
      setIssueStatuses(statuses);
    } catch (err) {
      const msg = err.response?.data?.error
        || (err.code === 'ERR_NETWORK' ? 'Could not reach the backend server. Make sure it is running on port 5000.' : 'Failed to analyze the file.');
      setError(msg);
      setStep('upload');
    } finally {
      setLoading(false);
    }
  }, []);

  const onDrop = useCallback((files) => {
    if (files.length) handleFile(files[0]);
  }, [handleFile]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'text/csv': ['.csv'],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.ms-excel': ['.xls'],
    },
    maxFiles: 1,
  });

  // ── Issue actions ──
  const acceptIssue = (id) => setIssueStatuses(s => ({ ...s, [id]: 'accepted' }));
  const rejectIssue = (id) => setIssueStatuses(s => ({ ...s, [id]: 'rejected' }));
  const customizeIssue = (id) => setIssueStatuses(s => ({ ...s, [id]: 'accepted' }));

  const acceptAll = () => {
    const s = {};
    Object.keys(issueStatuses).forEach(id => { s[id] = 'accepted'; });
    setIssueStatuses(s);
  };

  const applyRecommendations = async () => {
    setLoading(true);
    setError('');
    const accepted = Object.entries(issueStatuses).filter(([, v]) => v === 'accepted').map(([k]) => k);
    try {
      const res = await api.post('/apply-recommendations', { accepted });
      setHealthScore(res.data.newHealthScore);
      setStep('transform');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to apply recommendations.');
    } finally {
      setLoading(false);
    }
  };

  // ── Transformation ──
  const toggleTransform = (id) => {
    setSelectedTransforms(t => t.includes(id) ? t.filter(x => x !== id) : [...t, id]);
  };

  const applyTransforms = () => setStep('dashboard');

  // ── Dashboard ──
  const [chartPrefs, setChartPrefs] = useState({});
  const [showCustomize, setShowCustomize] = useState(false);

  const selectDashboard = async (type) => {
    setDashboardType(type);
    setLoading(true);
    setError('');
    setStep('visualize');
    try {
      const res = await api.post('/generate-dashboard', { dashboardType: type, chartPrefs: {} });
      setDashboardData(res.data);
      setChartPrefs({ categoryColumn: res.data.categoryColumn, valueColumn: res.data.valueColumn, dateColumn: res.data.dateColumn });
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to generate dashboard.');
      setStep('dashboard');
    } finally {
      setLoading(false);
    }
  };

  const regenerateDashboard = async (newPrefs) => {
    const merged = { ...chartPrefs, ...newPrefs };
    setChartPrefs(merged);
    setLoading(true);
    setError('');
    try {
      const res = await api.post('/generate-dashboard', { dashboardType, chartPrefs: merged });
      setDashboardData(res.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update dashboard.');
    } finally {
      setLoading(false);
    }
  };

  // ── Insights ──
  const loadInsights = async () => {
    setLoading(true);
    setError('');
    setStep('insights');
    try {
      const res = await api.get('/insights');
      setInsights(res.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to generate insights.');
      setStep('visualize');
    } finally {
      setLoading(false);
    }
  };

  // ── Export ──
  const [exportingKey, setExportingKey] = useState(null);

  const triggerDownload = (blob, filename) => {
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  };

  const doExport = async (key, endpoint, filenameFallback) => {
    setExportingKey(key);
    setError('');
    try {
      const res = await api.get(endpoint, { responseType: 'blob' });
      const disposition = res.headers['content-disposition'] || '';
      const match = disposition.match(/filename="?([^"]+)"?/);
      const filename = match ? match[1] : filenameFallback;
      triggerDownload(res.data, filename);
      setExportMsg(`${filename} downloaded successfully.`);
      setTimeout(() => setExportMsg(''), 3000);
    } catch (err) {
      // Blob error responses need to be parsed back into JSON to read the real message
      let msg = 'Export failed. Please try again.';
      if (err.response?.data instanceof Blob) {
        try {
          const text = await err.response.data.text();
          const parsed = JSON.parse(text);
          msg = parsed.error || msg;
        } catch (e) { /* keep default message */ }
      } else {
        msg = err.response?.data?.error || msg;
      }
      setError(msg);
    } finally {
      setExportingKey(null);
    }
  };

  const resetAll = () => {
    setStep('upload'); setAnalysisData(null); setDashboardData(null);
    setInsights(null); setUploadedFile(null); setError('');
  };

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div className="app-layout">
      <StepSidebar current={step} />

      <main className="app-main">
        {/* ── UPLOAD ── */}
        {step === 'upload' && (
          <div className="app-section">
            <div className="app-section-header">
              <div className="section-label">Phase 1</div>
              <h1 className="app-title font-display">Upload Your Dataset</h1>
              <p className="app-subtitle">Supports CSV and Excel files up to 100MB — your data is parsed and analyzed for real, not simulated</p>
            </div>
            <ErrorBanner message={error} />
            <div className="upload-area">
              <div {...getRootProps()} className={`dropzone ${isDragActive ? 'drag-active' : ''}`}>
                <input {...getInputProps()} />
                <div className="dropzone-icon"><FolderOpen size={40} strokeWidth={1.5} /></div>
                <div className="dropzone-title font-display">
                  {isDragActive ? 'Drop it here' : 'Drag & drop your file'}
                </div>
                <div className="dropzone-sub">or click to browse — CSV, XLS, XLSX</div>
                <div className="dropzone-formats">
                  <span className="badge badge-violet">CSV</span>
                  <span className="badge badge-cyan">XLSX</span>
                  <span className="badge badge-emerald">XLS</span>
                </div>
              </div>
            </div>
            <div className="upload-hint">
              <Lock size={13} /> <span>Your file is processed locally by your own backend server and deleted immediately after analysis</span>
            </div>
          </div>
        )}

        {/* ── SCAN (loading) ── */}
        {step === 'scan' && loading && (
          <div className="app-section center-content">
            <div className="scan-animation">
              <div className="scan-rings">
                <div className="scan-ring r1" />
                <div className="scan-ring r2" />
                <div className="scan-ring r3" />
                <div className="scan-icon"><Search size={28} strokeWidth={1.8} /></div>
              </div>
              <div className="scan-title font-display">Scanning Dataset...</div>
              <div className="scan-steps">
                {['Reading file structure', 'Detecting data types', 'Finding missing values', 'Identifying outliers', 'Calculating health score'].map((s, i) => (
                  <div key={i} className="scan-step-item" style={{ animationDelay: `${i * 0.5}s` }}>
                    <span className="scan-dot" />
                    {s}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── SCAN (results) ── */}
        {step === 'scan' && !loading && analysisData && (
          <div className="app-section">
            <div className="app-section-header">
              <div className="section-label">Phase 2 — Health Report</div>
              <h1 className="app-title font-display">Dataset Health Scan</h1>
            </div>

            <div className="scan-results-grid">
              <div className="health-score-card card">
                <div className="hsc-title font-display">Overall Health Score</div>
                <HealthRing score={healthScore != null ? healthScore : analysisData.healthScore} />
                <div className="hsc-file font-mono">{analysisData.fileName}</div>
                <div className="hsc-stats">
                  <div className="hcs-item"><span>{analysisData.rows?.toLocaleString()}</span>Rows</div>
                  <div className="hcs-item"><span>{analysisData.columns}</span>Columns</div>
                  <div className="hcs-item"><span>{analysisData.issues?.length}</span>Issues</div>
                </div>
                <HealthPillars pillars={analysisData.healthPillars} />
              </div>

              <div className="issues-summary card">
                <div className="is-title font-display">Issues Found</div>
                {analysisData.issues?.length === 0 && (
                  <div className="is-empty"><ShieldCheck size={18} /> No issues detected across completeness, validity, or consistency checks — this dataset is ready for analysis.</div>
                )}
                {analysisData.issues?.map(issue => {
                  const Icon = ISSUE_ICONS[issue.type] || HelpCircle;
                  return (
                    <div key={issue.id} className="is-row">
                      <div className="is-icon"><Icon size={17} strokeWidth={1.8} /></div>
                      <div className="is-info">
                        <div className="is-name">{issue.description}</div>
                        <div className="is-col font-mono">{issue.column}</div>
                      </div>
                      <div className="is-count">{issue.count}</div>
                      <SeverityBadge severity={issue.severity} />
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="col-stats card">
              <div className="cs-title font-display">Column Profile</div>
              <div className="cs-table">
                <div className="cs-head">
                  <span>Column</span><span>Type</span><span>Nulls</span><span>Details</span>
                </div>
                {analysisData.columnStats?.map((col, i) => (
                  <div key={i} className="cs-row">
                    <span className="font-mono">{col.name}</span>
                    <span><span className="badge badge-violet">{col.type}</span></span>
                    <span className={col.nulls > 0 ? 'text-amber' : 'text-emerald'}>{col.nulls}</span>
                    <span className="cs-detail">
                      {col.mean !== undefined ? `mean: ${col.mean.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : col.unique !== undefined ? `${col.unique} unique` : '—'}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="section-actions">
              <button className="btn-primary" onClick={() => setStep('clean')}>
                Review Recommendations <ArrowRight size={16} />
              </button>
            </div>
          </div>
        )}

        {/* ── CLEAN ── */}
        {step === 'clean' && analysisData && (
          <div className="app-section">
            <div className="app-section-header">
              <div className="section-label">Phase 3 — Cleaning Center</div>
              <h1 className="app-title font-display">AI Cleaning Suggestions</h1>
              <p className="app-subtitle">Review each suggestion and decide what to apply to your dataset</p>
            </div>
            <ErrorBanner message={error} />

            {analysisData.issues?.length === 0 ? (
              <div className="empty-state card">
                <CheckCircle2 size={32} style={{ color: 'var(--accent-emerald)' }} />
                <div className="empty-title font-display">No issues found</div>
                <div className="empty-desc">Your dataset passed all quality checks. You can continue straight to transformations.</div>
              </div>
            ) : (
              <>
                <div className="clean-toolbar">
                  <div className="clean-progress">
                    <span>{Object.values(issueStatuses).filter(v => v !== 'pending').length} of {analysisData.issues?.length} reviewed</span>
                    <div className="prog-bar">
                      <div className="prog-fill" style={{ width: `${(Object.values(issueStatuses).filter(v => v !== 'pending').length / (analysisData.issues?.length || 1)) * 100}%` }} />
                    </div>
                  </div>
                  <button className="btn-secondary" onClick={acceptAll}>Accept All</button>
                </div>

                <div className="issues-list">
                  {analysisData.issues?.map(issue => (
                    <IssueCard
                      key={issue.id}
                      issue={issue}
                      status={issueStatuses[issue.id] || 'pending'}
                      onAccept={acceptIssue}
                      onReject={rejectIssue}
                      onCustomize={customizeIssue}
                    />
                  ))}
                </div>
              </>
            )}

            <div className="section-actions">
              <button className="btn-primary" onClick={applyRecommendations} disabled={loading}>
                {loading ? <Loader2 size={16} className="spin" /> : null}
                {loading ? 'Applying...' : 'Apply Approved Changes'} {!loading && <ArrowRight size={16} />}
              </button>
            </div>
          </div>
        )}

        {/* ── TRANSFORM ── */}
        {step === 'transform' && analysisData && (
          <div className="app-section">
            <div className="app-section-header">
              <div className="section-label">Phase 4 — Smart Transform</div>
              <h1 className="app-title font-display">Transformation Suggestions</h1>
              <p className="app-subtitle">AI-proposed data transformations to improve analysis quality</p>
            </div>

            <div className="new-health card">
              <HealthRing score={healthScore != null ? healthScore : analysisData.healthScore} />
              <div style={{ marginLeft: 20 }}>
                <div className="font-display" style={{ fontSize: 18, fontWeight: 600 }}>Updated Health Score</div>
                <div style={{ color: 'var(--text-secondary)', marginTop: 6 }}>Approved cleaning recommendations applied.</div>
                {healthScore != null && healthScore > analysisData.healthScore && (
                  <div style={{ marginTop: 12 }}><span className="badge badge-emerald">+{healthScore - analysisData.healthScore} points improved</span></div>
                )}
              </div>
            </div>

            <div className="transform-list">
              {analysisData.transformationSuggestions?.map(t => (
                <div key={t.id} className={`transform-card card ${selectedTransforms.includes(t.id) ? 'selected' : ''}`} onClick={() => toggleTransform(t.id)}>
                  <div className="tc-check">{selectedTransforms.includes(t.id) ? <CheckCircle2 size={18} /> : <span className="tc-circle" />}</div>
                  <div className="tc-body">
                    <div className="tc-title font-display">{t.description}</div>
                    <div className="tc-reason">{t.reason}</div>
                    {t.columns?.length > 0 && (
                      <div className="tc-cols">
                        {t.columns.map(c => <span key={c} className="badge badge-violet font-mono">{c}</span>)}
                      </div>
                    )}
                  </div>
                  <span className={`badge ${t.type === 'normalize' ? 'badge-cyan' : t.type === 'encode' ? 'badge-emerald' : t.type === 'feature_engineering' ? 'badge-amber' : 'badge-rose'}`}>{t.type.replace(/_/g, ' ')}</span>
                </div>
              ))}
            </div>

            <div className="section-actions">
              <button className="btn-primary" onClick={applyTransforms}>
                Apply & Continue to Dashboard <ArrowRight size={16} />
              </button>
              <button className="btn-secondary" onClick={() => setStep('dashboard')}>
                Skip Transformations
              </button>
            </div>
          </div>
        )}

        {/* ── DASHBOARD SELECTION ── */}
        {step === 'dashboard' && (
          <div className="app-section">
            <div className="app-section-header">
              <div className="section-label">Phase 5 — Dashboard Style</div>
              <h1 className="app-title font-display">Choose Your Dashboard</h1>
              <p className="app-subtitle">Each style renders different charts, layouts, and emphasis — pick what matches your audience</p>
            </div>
            <ErrorBanner message={error} />
            <div className="db-select-grid">
              {[
                { type: 'executive', Icon: Briefcase, name: 'Executive', desc: 'High-level KPIs and trend-over-time, built for a quick leadership readout.', features: ['KPI summary cards', 'Trend area chart', 'Category pie chart', 'Top performers bar'], color: 'var(--accent-violet)' },
                { type: 'analytical', Icon: FlaskConical, name: 'Analytical', desc: 'Statistical depth — distributions, scatter relationships, and correlation context.', features: ['Value distribution histogram', 'Correlation scatter plot', 'Detailed category table', 'Full numeric stats'], color: 'var(--accent-cyan)' },
                { type: 'operational', Icon: Settings, name: 'Operational', desc: 'Status-oriented monitoring view focused on category performance and tracking.', features: ['Category bar comparison', 'Trend line (compact)', 'Performance indicators', 'Count breakdown'], color: 'var(--accent-emerald)' },
                { type: 'storytelling', Icon: BookOpen, name: 'Storytelling', desc: 'A narrative flow — one chart at a time with callouts, built for presenting.', features: ['Single focus chart', 'Annotated peak/trough', 'Narrative callouts', 'Clean export layout'], color: 'var(--accent-amber)' },
              ].map(d => (
                <div key={d.type} className="db-select-card card" onClick={() => selectDashboard(d.type)} style={{ '--cc': d.color }}>
                  <div className="dbs-icon" style={{ color: d.color }}><d.Icon size={30} strokeWidth={1.6} /></div>
                  <div className="dbs-name font-display" style={{ color: d.color }}>{d.name}</div>
                  <div className="dbs-desc">{d.desc}</div>
                  <ul className="dbs-features">
                    {d.features.map(f => <li key={f}><CheckCircle2 size={13} /> {f}</li>)}
                  </ul>
                  <button className="btn-primary dbs-btn" style={{ marginTop: 'auto' }}>
                    Select {d.name} <ArrowRight size={15} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── VISUALIZE ── */}
        {step === 'visualize' && loading && (
          <div className="app-section center-content">
            <div className="scan-animation">
              <div className="scan-rings">
                <div className="scan-ring r1" /><div className="scan-ring r2" /><div className="scan-ring r3" />
                <div className="scan-icon"><BarChart2 size={28} strokeWidth={1.8} /></div>
              </div>
              <div className="scan-title font-display">Generating Dashboard...</div>
            </div>
          </div>
        )}

        {step === 'visualize' && !loading && dashboardData && (
          <DashboardView
            dashboardData={dashboardData}
            dashboardType={dashboardType}
            error={error}
            chartPrefs={chartPrefs}
            showCustomize={showCustomize}
            setShowCustomize={setShowCustomize}
            onRegenerate={regenerateDashboard}
            onContinue={loadInsights}
            onChangeStyle={() => setStep('dashboard')}
          />
        )}

        {/* ── INSIGHTS ── */}
        {step === 'insights' && loading && (
          <div className="app-section center-content">
            <div className="scan-animation">
              <div className="scan-rings">
                <div className="scan-ring r1" /><div className="scan-ring r2" /><div className="scan-ring r3" />
                <div className="scan-icon"><Brain size={28} strokeWidth={1.8} /></div>
              </div>
              <div className="scan-title font-display">Generating Insights...</div>
            </div>
          </div>
        )}

        {step === 'insights' && !loading && insights && (
          <div className="app-section">
            <div className="app-section-header">
              <div className="section-label">Phase 6 — AI Insights</div>
              <h1 className="app-title font-display">Key Findings</h1>
              <p className="app-subtitle">Pattern recognition and business intelligence from your dataset</p>
            </div>
            <ErrorBanner message={error} />

            <div className="insights-summary card">
              <div className="is-sum-icon"><Lightbulb size={24} strokeWidth={1.8} /></div>
              <div>
                <div className="font-display" style={{ fontWeight: 600, marginBottom: 8 }}>Executive Summary</div>
                <div style={{ color: 'var(--text-secondary)', lineHeight: 1.7 }}>{insights.summary}</div>
              </div>
            </div>

            <div className="insights-grid">
              {insights.findings?.map((f, i) => <InsightCard key={i} finding={f} index={i} />)}
            </div>

            <div className="section-actions">
              <button className="btn-primary" onClick={() => setStep('export')}>
                Export Results <ArrowRight size={16} />
              </button>
            </div>
          </div>
        )}

        {/* ── EXPORT ── */}
        {step === 'export' && (
          <div className="app-section">
            <div className="app-section-header">
              <div className="section-label">Phase 7 — Export & Share</div>
              <h1 className="app-title font-display">Export Your Work</h1>
              <p className="app-subtitle">Download the cleaned dataset, reports, and insights</p>
            </div>

            {exportMsg && <div className="export-toast"><CheckCircle2 size={16} /> {exportMsg}</div>}
            <ErrorBanner message={error} />

            <div className="export-grid">
              {[
                {
                  key: 'dataset', Icon: FileText, title: 'Cleaned Dataset',
                  desc: 'Your dataset with all approved cleaning applied, ready for further analysis.',
                  color: 'var(--accent-violet)',
                  buttons: [
                    { label: 'CSV', endpoint: '/export/dataset?format=csv', filename: 'dataset_cleaned.csv' },
                    { label: 'Excel', endpoint: '/export/dataset?format=xlsx', filename: 'dataset_cleaned.xlsx' },
                  ],
                },
                {
                  key: 'dashboard', Icon: BarChart2, title: 'Dashboard Report',
                  desc: dashboardData
                    ? 'KPIs and the category breakdown from your generated dashboard, as a PDF.'
                    : 'Generate a dashboard in Phase 7 first to enable this export.',
                  color: 'var(--accent-cyan)',
                  buttons: [
                    { label: 'PDF', endpoint: '/export/dashboard-pdf', filename: 'dashboard_report.pdf' },
                  ],
                },
                {
                  key: 'insights', Icon: Brain, title: 'AI Insights PDF',
                  desc: insights
                    ? 'Comprehensive AI-generated insight report with findings and confidence scores.'
                    : 'Generate AI insights in Phase 8 first to enable this export.',
                  color: 'var(--accent-emerald)',
                  buttons: [
                    { label: 'PDF', endpoint: '/export/insights-pdf', filename: 'ai_insights_report.pdf' },
                  ],
                },
                {
                  key: 'presentation', Icon: Presentation, title: 'Presentation Deck',
                  desc: (dashboardData && insights)
                    ? 'Ready-to-present slides with key metrics and insights formatted for stakeholders.'
                    : 'Generate a dashboard and AI insights first to enable this export.',
                  color: 'var(--accent-amber)',
                  buttons: [
                    { label: 'PPTX', endpoint: '/export/presentation', filename: 'presentation_deck.pptx' },
                  ],
                },
              ].map((e) => (
                <div key={e.key} className="export-card card">
                  <div className="export-icon" style={{ color: e.color }}><e.Icon size={30} strokeWidth={1.6} /></div>
                  <div className="export-name font-display">{e.title}</div>
                  <div className="export-desc">{e.desc}</div>
                  <div className="export-formats">
                    {e.buttons.map(btn => {
                      const busy = exportingKey === `${e.key}-${btn.label}`;
                      return (
                        <button
                          key={btn.label}
                          className="btn-primary export-btn"
                          disabled={busy}
                          onClick={() => doExport(`${e.key}-${btn.label}`, btn.endpoint, btn.filename)}
                          style={{ fontSize: 12, padding: '8px 16px' }}
                        >
                          {busy ? <Loader2 size={13} className="spin" /> : <FileSpreadsheet size={13} />}
                          {busy ? 'Preparing...' : `Download ${btn.label}`}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            <div className="section-actions" style={{ marginTop: 48 }}>
              <button className="btn-secondary" onClick={resetAll}>
                <ArrowLeft size={15} /> Analyze Another Dataset
              </button>
              <button className="btn-secondary" onClick={() => navigate('/')}>
                <ArrowLeft size={15} /> Back to Home
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
