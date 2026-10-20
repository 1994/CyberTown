import { Component } from 'react';
import type { ReactNode } from 'react';

export class ErrorBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error) {
    console.error('[scene] render error', error);
  }
  render() {
    return this.state.error ? this.props.fallback : this.props.children;
  }
}
