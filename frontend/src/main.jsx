/**
 * FreightOne frontend entry point.
 * Structured multi-file React app — visual design is preserved from the
 * original prototype; only the module boundaries and data wiring changed.
 */
import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';
import { getGreeting } from './utils/greetingHelper';

class FreightOneErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 40, color: '#edf3fb', fontFamily: 'Inter, sans-serif' }}>
          <h2>Something went wrong</h2>
          <pre style={{ whiteSpace: 'pre-wrap', color: '#e06b67' }}>
            {String(this.state.error)}
          </pre>
        </div>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById('root')).render(
  <FreightOneErrorBoundary>
    <App />
  </FreightOneErrorBoundary>,
);
