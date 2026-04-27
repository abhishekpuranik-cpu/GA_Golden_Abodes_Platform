import { Component } from 'react';
import { Link } from 'react-router-dom';

export class ErrorBoundary extends Component {
  state = { err: null };

  static getDerivedStateFromError(err) {
    return { err };
  }

  componentDidCatch(err, info) {
    console.error(err, info?.componentStack);
  }

  render() {
    if (this.state.err) {
      return (
        <div style={{ minHeight: '100vh', padding: 40, background: '#0a1628', color: '#f1f5f9', fontFamily: 'system-ui' }}>
          <h1 style={{ fontSize: 20 }}>Something went wrong</h1>
          <pre style={{ color: '#94a3b8', overflow: 'auto' }}>{String(this.state.err)}</pre>
          <Link to="/" style={{ color: '#2dd4bf' }}>
            Back to vault
          </Link>
        </div>
      );
    }
    return this.props.children;
  }
}
