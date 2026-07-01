import React, { useRef, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import * as THREE from 'three';
import {
  Sparkles, Search, Users, Zap, Palette, BarChart3, Brain,
  Briefcase, FlaskConical, Settings, BookOpen, ArrowRight, Check,
} from 'lucide-react';
import ThemeToggle from '../components/ThemeToggle';
import { useTheme } from '../ThemeContext';
import './LandingPage.css';

// ─── 3D Globe / Data Network Canvas ──────────────────────────────────────────
function DataGlobe() {
  const canvasRef = useRef(null);
  const { theme } = useTheme();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(canvas.offsetWidth, canvas.offsetHeight);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(60, canvas.offsetWidth / canvas.offsetHeight, 0.1, 100);
    camera.position.set(0, 0, 4);

    const isLight = theme === 'light';
    const wireColor = isLight ? 0x4f46e5 : 0x6366f1;
    const wireOpacity = isLight ? 0.18 : 0.12;
    const solidColor = isLight ? 0xf0f0fa : 0x0d0d20;

    const globeGeo = new THREE.SphereGeometry(1.5, 32, 32);
    const globeMat = new THREE.MeshBasicMaterial({ color: wireColor, wireframe: true, transparent: true, opacity: wireOpacity });
    const globe = new THREE.Mesh(globeGeo, globeMat);
    scene.add(globe);

    const solidGeo = new THREE.SphereGeometry(1.48, 64, 64);
    const solidMat = new THREE.MeshBasicMaterial({ color: solidColor, transparent: true, opacity: 0.95 });
    scene.add(new THREE.Mesh(solidGeo, solidMat));

    const points = [];
    const pointGeo = new THREE.SphereGeometry(0.025, 8, 8);
    const colors = [0x6366f1, 0x06b6d4, 0x10b981, 0xf59e0b];
    for (let i = 0; i < 60; i++) {
      const phi = Math.acos(-1 + (2 * i) / 60);
      const theta = Math.sqrt(60 * Math.PI) * phi;
      const x = 1.5 * Math.sin(phi) * Math.cos(theta);
      const y = 1.5 * Math.sin(phi) * Math.sin(theta);
      const z = 1.5 * Math.cos(phi);
      const mat = new THREE.MeshBasicMaterial({ color: colors[i % 4] });
      const pt = new THREE.Mesh(pointGeo, mat);
      pt.position.set(x, y, z);
      scene.add(pt);
      points.push(pt);
    }

    const lineMat = new THREE.LineBasicMaterial({ color: wireColor, transparent: true, opacity: isLight ? 0.18 : 0.25 });
    for (let i = 0; i < points.length; i++) {
      for (let j = i + 1; j < points.length; j++) {
        if (points[i].position.distanceTo(points[j].position) < 0.9) {
          const lineGeo = new THREE.BufferGeometry().setFromPoints([points[i].position, points[j].position]);
          scene.add(new THREE.Line(lineGeo, lineMat));
        }
      }
    }

    const ringGeo = new THREE.RingGeometry(1.7, 1.72, 128);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0x06b6d4, transparent: true, opacity: isLight ? 0.3 : 0.4, side: THREE.DoubleSide });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = Math.PI / 3;
    scene.add(ring);

    const particleCount = 200;
    const positions = new Float32Array(particleCount * 3);
    for (let i = 0; i < particleCount; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 8;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 8;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 8;
    }
    const pGeo = new THREE.BufferGeometry();
    pGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const pMat = new THREE.PointsMaterial({ color: wireColor, size: 0.03, transparent: true, opacity: isLight ? 0.4 : 0.6 });
    scene.add(new THREE.Points(pGeo, pMat));

    let mouseX = 0, mouseY = 0;
    const handleMouse = (e) => {
      mouseX = (e.clientX / window.innerWidth - 0.5) * 2;
      mouseY = (e.clientY / window.innerHeight - 0.5) * 2;
    };
    window.addEventListener('mousemove', handleMouse);

    let animId;
    const clock = new THREE.Clock();
    const animate = () => {
      animId = requestAnimationFrame(animate);
      const t = clock.getElapsedTime();
      globe.rotation.y = t * 0.12 + mouseX * 0.3;
      globe.rotation.x = mouseY * 0.15;
      ring.rotation.z = t * 0.08;
      renderer.render(scene, camera);
    };
    animate();

    const handleResize = () => {
      renderer.setSize(canvas.offsetWidth, canvas.offsetHeight);
      camera.aspect = canvas.offsetWidth / canvas.offsetHeight;
      camera.updateProjectionMatrix();
    };
    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('mousemove', handleMouse);
      window.removeEventListener('resize', handleResize);
      renderer.dispose();
    };
  }, [theme]);

  return <canvas ref={canvasRef} className="globe-canvas" />;
}

// ─── Animated Counter ─────────────────────────────────────────────────────────
function Counter({ end, suffix = '', duration = 2000 }) {
  const [count, setCount] = useState(0);
  const ref = useRef(null);
  const started = useRef(false);

  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !started.current) {
        started.current = true;
        const startTime = performance.now();
        const step = (now) => {
          const elapsed = now - startTime;
          const progress = Math.min(elapsed / duration, 1);
          const eased = 1 - Math.pow(1 - progress, 3);
          setCount(Math.floor(eased * end));
          if (progress < 1) requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      }
    }, { threshold: 0.5 });
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [end, duration]);

  return <span ref={ref}>{count.toLocaleString()}{suffix}</span>;
}

// ─── Feature Card ─────────────────────────────────────────────────────────────
function FeatureCard({ Icon, title, description, color, delay }) {
  return (
    <div className="feature-card" style={{ animationDelay: `${delay}ms` }}>
      <div className="feature-icon">
        <span className="feature-icon-bg" style={{ background: `${color}18`, border: `1px solid ${color}30`, color }}>
          <Icon size={22} strokeWidth={1.8} />
        </span>
      </div>
      <h3 className="feature-title">{title}</h3>
      <p className="feature-desc">{description}</p>
    </div>
  );
}

// ─── Workflow Step ────────────────────────────────────────────────────────────
function WorkflowStep({ number, title, description, active }) {
  return (
    <div className={`workflow-step ${active ? 'active' : ''}`}>
      <div className="workflow-num">{String(number).padStart(2, '0')}</div>
      <div className="workflow-content">
        <div className="workflow-title">{title}</div>
        <div className="workflow-desc">{description}</div>
      </div>
      <div className="workflow-connector" />
    </div>
  );
}

// ─── Main Landing ─────────────────────────────────────────────────────────────
export default function LandingPage() {
  const navigate = useNavigate();
  const [activeStep, setActiveStep] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setActiveStep(s => (s + 1) % 9);
    }, 2500);
    return () => clearInterval(interval);
  }, []);

  const features = [
    { Icon: Search, title: 'AI Quality Assessment', description: 'Instantly scan datasets for missing values, duplicates, outliers, and format inconsistencies with a single upload.', color: '#6366f1' },
    { Icon: Users, title: 'Human-in-the-Loop', description: 'Review every AI suggestion before applying. Accept, reject, or customize each recommendation — you stay in control.', color: '#06b6d4' },
    { Icon: Zap, title: 'Smart Transformation', description: 'AI recommends normalization, encoding, feature engineering, and dimensionality reduction tailored to your data.', color: '#10b981' },
    { Icon: Palette, title: 'Dashboard Styles', description: 'Choose from Executive, Analytical, Operational, or Storytelling dashboards, each built for a different audience.', color: '#f59e0b' },
    { Icon: BarChart3, title: 'Auto Visualization', description: 'The system selects the right chart type for each data relationship — no manual configuration required.', color: '#a78bfa' },
    { Icon: Brain, title: 'AI Insight Engine', description: 'Get natural language summaries of trends, anomalies, correlations, and forecasts extracted from your data.', color: '#f43f5e' },
  ];

  const steps = [
    { title: 'Upload Dataset', description: 'CSV or Excel — drag and drop to start' },
    { title: 'Health Scan', description: 'AI analyzes quality in seconds' },
    { title: 'Review Issues', description: 'See what was found with explanations' },
    { title: 'Apply Fixes', description: 'Accept or customize each suggestion' },
    { title: 'Transform Data', description: 'Approve smart transformation proposals' },
    { title: 'Pick Dashboard', description: 'Choose your visualization style' },
    { title: 'Generate Charts', description: 'Automated, intelligent visualizations' },
    { title: 'Discover Insights', description: 'AI interprets patterns and trends' },
    { title: 'Export & Share', description: 'Download reports and cleaned datasets' },
  ];

  const dashboardStyles = [
    { type: 'executive', Icon: Briefcase, name: 'Executive', desc: 'High-level KPIs and business metrics for leadership', color: '#6366f1' },
    { type: 'analytical', Icon: FlaskConical, name: 'Analytical', desc: 'Deep-dive exploration with drill-down analysis', color: '#06b6d4' },
    { type: 'operational', Icon: Settings, name: 'Operational', desc: 'Real-time performance monitoring and tracking', color: '#10b981' },
    { type: 'storytelling', Icon: BookOpen, name: 'Storytelling', desc: 'Presentation-ready visual narratives', color: '#f59e0b' },
  ];

  return (
    <div className="landing">
      {/* Nav */}
      <nav className="nav">
        <div className="nav-inner">
          <div className="nav-logo">
            <span className="logo-icon">◈</span>
            <span className="logo-text">DataAnalyst<span className="logo-accent">AI</span></span>
          </div>
          <div className="nav-links">
            <a href="#features">Features</a>
            <a href="#workflow">Workflow</a>
            <a href="#stats">Stats</a>
          </div>
          <ThemeToggle className="nav-theme-toggle" />
          <button className="btn-primary nav-cta" onClick={() => navigate('/app')}>
            Launch App <ArrowRight size={16} />
          </button>
        </div>
      </nav>

      {/* Hero */}
      <section className="hero">
        <div className="orb orb-violet" style={{ width: 600, height: 600, top: '-200px', right: '-100px' }} />
        <div className="orb orb-cyan" style={{ width: 400, height: 400, bottom: '0px', left: '-100px' }} />

        <div className="hero-content">
          <div className="hero-left">
            <div className="hero-badge">
              <span className="badge badge-violet"><Sparkles size={12} /> AI-Powered Analytics</span>
            </div>
            <h1 className="hero-title font-display">
              From raw data to<br />
              <span className="gradient-text">actionable insights</span><br />
              in minutes.
            </h1>
            <p className="hero-subtitle">
              DataAnalyst AI automates data cleaning, transformation, and visualization
              — with you in control at every step. No data science degree required.
            </p>
            <div className="hero-actions">
              <button className="btn-primary hero-btn" onClick={() => navigate('/app')}>
                Analyze Your Data Free <ArrowRight size={16} />
              </button>
              <button className="btn-secondary hero-btn" onClick={() => document.getElementById('workflow').scrollIntoView({ behavior: 'smooth' })}>
                See How It Works
              </button>
            </div>
            <div className="hero-trust">
              <div className="trust-item"><Check size={14} className="trust-icon" /> No coding needed</div>
              <div className="trust-item"><Check size={14} className="trust-icon" /> CSV & Excel support</div>
              <div className="trust-item"><Check size={14} className="trust-icon" /> Human-in-the-loop</div>
            </div>
          </div>
          <div className="hero-right">
            <div className="globe-wrapper">
              <DataGlobe />
              <div className="globe-labels">
                <div className="globe-label top-left">
                  <div className="gl-num gradient-text">2,847</div>
                  <div className="gl-text">Rows Analyzed</div>
                </div>
                <div className="globe-label top-right">
                  <div className="gl-num" style={{ color: 'var(--accent-cyan)' }}>82<small>/100</small></div>
                  <div className="gl-text">Health Score</div>
                </div>
                <div className="globe-label bottom-left">
                  <div className="gl-num" style={{ color: 'var(--accent-emerald)' }}>+21%</div>
                  <div className="gl-text">Q4 Growth</div>
                </div>
                <div className="globe-label bottom-right">
                  <div className="gl-num" style={{ color: 'var(--accent-amber)' }}>6</div>
                  <div className="gl-text">AI Insights</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="stats-section" id="stats">
        <div className="stats-grid">
          {[
            { value: 9, suffix: '', label: 'Pipeline phases, upload to export' },
            { value: 6, suffix: '', label: 'Chart types: area, line, bar, pie, scatter, histogram' },
            { value: 4, suffix: '', label: 'Dashboard styles to choose from' },
            { value: 4, suffix: '', label: 'Real-time downloadable export formats' },
          ].map((s, i) => (
            <div className="stat-item" key={i}>
              <div className="stat-number gradient-text font-display">
                <Counter end={s.value} suffix={s.suffix} />
              </div>
              <div className="stat-label">{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="features-section" id="features">
        <div className="section-header">
          <div className="section-label">Platform Capabilities</div>
          <h2 className="section-title font-display">Everything you need<br /><span className="gradient-text">in one platform</span></h2>
          <p className="section-sub">From upload to insight — no tool-switching, no context loss, no wasted time.</p>
        </div>
        <div className="features-grid">
          {features.map((f, i) => (
            <FeatureCard key={i} {...f} delay={i * 80} />
          ))}
        </div>
      </section>

      {/* Workflow */}
      <section className="workflow-section" id="workflow">
        <div className="orb orb-violet" style={{ width: 500, height: 500, top: '50%', left: '50%', transform: 'translate(-50%,-50%)' }} />
        <div className="section-header">
          <div className="section-label">9-Phase Pipeline</div>
          <h2 className="section-title font-display">How it works</h2>
          <p className="section-sub">A guided journey from messy data to clear decisions.</p>
        </div>
        <div className="workflow-list">
          {steps.map((s, i) => (
            <WorkflowStep key={i} number={i + 1} title={s.title} description={s.description} active={activeStep === i} />
          ))}
        </div>
      </section>

      {/* Dashboard types */}
      <section className="dashboards-section">
        <div className="section-header">
          <div className="section-label">Dashboard Styles</div>
          <h2 className="section-title font-display">Pick your<br /><span className="gradient-text">perspective</span></h2>
        </div>
        <div className="dashboard-cards">
          {dashboardStyles.map((d, i) => (
            <div className="dashboard-card card" key={i} onClick={() => navigate('/app')} style={{ '--card-color': d.color }}>
              <div className="dc-icon" style={{ color: d.color }}><d.Icon size={28} strokeWidth={1.8} /></div>
              <div className="dc-name font-display" style={{ color: d.color }}>{d.name}</div>
              <div className="dc-desc">{d.desc}</div>
              <div className="dc-arrow"><ArrowRight size={16} /></div>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="cta-section">
        <div className="orb orb-violet" style={{ width: 700, height: 700, top: '50%', left: '50%', transform: 'translate(-50%,-50%)' }} />
        <div className="cta-inner">
          <div className="section-label" style={{ textAlign: 'center', marginBottom: 20 }}>Start for free</div>
          <h2 className="cta-title font-display">
            Your data is waiting<br />
            <span className="gradient-text">to tell its story.</span>
          </h2>
          <p className="cta-sub">Upload your dataset and get your first AI analysis in under 60 seconds.</p>
          <button className="btn-primary cta-btn" onClick={() => navigate('/app')}>
            Launch DataAnalyst AI <ArrowRight size={18} />
          </button>
          <p className="cta-note">No sign-up required · CSV & Excel · Free to use</p>
        </div>
      </section>

      {/* Footer */}
      <footer className="footer">
        <div className="footer-inner">
          <div className="footer-logo">
            <span className="logo-icon">◈</span>
            <span className="logo-text">DataAnalyst<span className="logo-accent">AI</span></span>
          </div>
          <p className="footer-copy">© 2024 DataAnalyst AI. Turning raw data into clear decisions.</p>
        </div>
      </footer>
    </div>
  );
}
