import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

/**
 * Catches render-time crashes so a single bad map or malformed response shows a
 * recoverable message instead of a blank screen.
 */
class ErrorBoundary extends React.Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('[SETU] render error:', error, info);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="grid h-screen place-items-center p-8 text-center bg-[var(--color-bg)] text-[var(--color-text)]">
        <div className="max-w-md space-y-4 p-6 bg-[var(--color-surface)] rounded-[var(--radius-lg)] border border-[var(--color-divider)] shadow-[var(--shadow-md)]">
          <i className="ph-duotone ph-warning-circle text-4xl text-[var(--color-accent-2)]"></i>
          <h1 className="text-xl font-bold text-[var(--color-text)]">Something broke on this screen</h1>
          <p className="text-sm text-[color-mix(in_srgb,var(--color-text)_70%,transparent)]">
            {this.state.error.message}
          </p>
          <button className="btn btn-primary text-sm" onClick={() => window.location.reload()}>
            Reload Sanctuary
          </button>
        </div>
      </div>
    );
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
