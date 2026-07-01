import React from 'react';
import { Sun, Moon } from 'lucide-react';
import { useTheme } from '../ThemeContext';

export default function ThemeToggle({ className = '' }) {
  const { theme, toggleTheme } = useTheme();

  return (
    <button
      className={`theme-toggle ${className}`}
      onClick={toggleTheme}
      aria-label="Toggle light and dark theme"
      title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      <span className={`theme-toggle-track ${theme}`}>
        <span className="theme-toggle-thumb">
          {theme === 'dark' ? <Moon size={13} strokeWidth={2.2} /> : <Sun size={13} strokeWidth={2.2} />}
        </span>
      </span>
    </button>
  );
}
