# DataAnalyst AI

> An intelligent data analytics platform — from raw data to actionable insights in minutes.

## Features

- **AI Data Quality Assessment** — auto-detects missing values, duplicates, IQR-based outliers, negative-value sanity issues, casing/whitespace inconsistencies, constant columns, and type mismatches **from your actual uploaded file**
- **Transparent Health Score** — broken into four pillars (Completeness, Uniqueness, Validity, Consistency) instead of one opaque number
- **Human-in-the-Loop Cleaning** — review, accept, reject, or customize every AI suggestion
- **Smart Transformation** — normalization, encoding, feature engineering recommendations based on real column statistics and correlations
- **4 Genuinely Different Dashboard Styles** — Executive, Analytical, Operational, and Storytelling each render a different chart mix (trend + pie, distribution + scatter, category bars, single narrative chart)
- **Dashboard Customization** — pick which column to group by, which numeric measure to chart, and which date column to use as the time axis, then regenerate on demand
- **Concrete AI Insights** — surfaces specific findings like "November was the strongest month, 59% above average" or "Alex Chen outperformed 83% of sales reps," not generic filler
- **Real, Working Exports** — cleaned dataset (CSV/Excel), dashboard report (PDF), AI insights report (PDF), and a presentation deck (PPTX) — every download button produces an actual file, generated server-side from your real data
- **Light / Dark Theme Toggle** — persisted across sessions, with theme-aware chart colors (axis labels, tooltips, gridlines) that stay readable in both modes
- **Icon System** — consistent lucide-react icons throughout, no emoji

## Quick Start (Windows)

### Option A — Double-click
1. Make sure [Node.js](https://nodejs.org) (v18+) is installed
2. Double-click **`START.bat`**
3. Wait for both servers to start
4. Browser opens at **http://localhost:3000**

### Option B — VSCode Terminal
```bash
npm run install:all
npm start
```

### Option C — Manual (two terminals)
**Terminal 1 — Backend:**
```bash
cd backend
npm install
npm start
```

**Terminal 2 — Frontend:**
```bash
cd frontend
npm install
npm start
```

## Project Structure

```
dataanalyst-ai/
├── START.bat
├── package.json
├── README.md
│
├── frontend/                 # React app (port 3000)
│   ├── public/index.html
│   ├── package.json
│   └── src/
│       ├── App.js
│       ├── index.css
│       ├── index.js
│       ├── ThemeContext.js
│       ├── components/
│       │   └── ThemeToggle.js
│       └── pages/
│           ├── LandingPage.js
│           ├── LandingPage.css
│           ├── AnalyticsApp.js
│           └── AnalyticsApp.css
│
└── backend/                  # Express API (port 5000)
    ├── package.json
    └── src/
        ├── server.js
        ├── dataEngine.js       # File parsing, type inference, quality checks
        └── insightsEngine.js   # Dashboard generation + concrete AI insights
```

## The 9-Phase Workflow

| Phase | Step | Description |
|-------|------|-------------|
| 1 | Upload | CSV or Excel via drag-and-drop |
| 2 | Health Scan | Real quality checks: missing values, duplicates, outliers, casing issues, constant columns |
| 3 | Review Issues | Each problem shown with severity and a concrete recommendation |
| 4 | Apply Fixes | Accept / Reject / Customize each suggestion |
| 5 | Transform | Normalization, encoding, feature engineering, correlation-based drop suggestions |
| 6 | Dashboard Style | Executive / Analytical / Operational / Storytelling — each renders different charts |
| 7 | Visualization | Customize which columns/measures feed the charts, then regenerate |
| 8 | AI Insights | Specific, grounded findings: peak periods, entity rankings, category concentration, correlations |
| 9 | Export | CSV, PDF, PPTX, reports |

## Real Data, Not Demos

Every number you see — health score, missing value counts, outliers, KPIs, chart values, and AI insight findings — is computed live from the file you upload. Upload any CSV or Excel file with any column names and the platform will:

- Infer each column's type (integer, float, date, categorical, string)
- Detect missing values, duplicate rows, IQR-based statistical outliers, inconsistent date formats, type mismatches, implausible negative values, inconsistent text casing, and constant columns
- Calculate a health score from four weighted pillars: completeness, uniqueness, validity, and consistency
- Pick the best date/category/numeric columns automatically to build dashboards — or let you override the selection
- Generate insights grounded in the actual statistics of your file: peak/trough periods with percentages, category concentration ("X accounts for 38% of revenue, 2.6x the next closest"), entity-level percentile rankings ("Alex Chen outperformed 83% of sales reps"), and correlation relationships

There is no hardcoded "sales_data" fallback — if the backend can't reach your file or the upload fails, you'll see a clear error message instead of substitute data.

## Design System

| Token | Dark | Light |
|-------|------|-------|
| Primary bg | `#05050f` | `#f7f7fc` |
| Accent violet | `#6366f1` | `#4f46e5` |
| Accent cyan | `#06b6d4` | `#0891b2` |
| Accent emerald | `#10b981` | `#059669` |
| Display font | Space Grotesk | Space Grotesk |
| Body font | Inter | Inter |
| Mono font | JetBrains Mono | JetBrains Mono |

Theme toggle is available in the landing page nav and in the analytics app sidebar, persisted via localStorage.

## Tech Stack

**Frontend** — React 18, React Router, Three.js (3D globe), Recharts, react-dropzone, lucide-react

**Backend** — Node.js, Express, multer, papaparse, xlsx

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/analyze` | Upload and scan dataset |
| POST | `/api/apply-recommendations` | Actually applies accepted cleaning operations to the full dataset |
| POST | `/api/generate-dashboard` | Generate dashboard data (accepts `chartPrefs` for customization) |
| GET | `/api/insights` | Get AI insight findings |
| GET | `/api/export/dataset?format=csv\|xlsx` | Download the cleaned dataset |
| GET | `/api/export/dashboard-pdf` | Download a PDF of the current dashboard's KPIs and category breakdown |
| GET | `/api/export/insights-pdf` | Download a PDF of the AI insight findings |
| GET | `/api/export/presentation` | Download a PPTX deck combining KPIs and insights |

## Requirements

- Node.js v18 or later
- npm v9 or later
- Modern browser (Chrome, Edge, Firefox)

---

Built with DataAnalyst AI
