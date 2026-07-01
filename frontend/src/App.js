import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import './index.css';
import { ThemeProvider } from './ThemeContext';
import LandingPage from './pages/LandingPage';
import AnalyticsApp from './pages/AnalyticsApp';

function App() {
  return (
    <ThemeProvider>
      <Router>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/app" element={<AnalyticsApp />} />
        </Routes>
      </Router>
    </ThemeProvider>
  );
}

export default App;
