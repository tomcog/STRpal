import { Component } from 'react';

// A view that throws shouldn't take the nav down with it (the old router
// isolated each view's load() the same way).
export class ViewBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error) {
    console.error('view failed to render:', error);
  }

  render() {
    if (this.state.error) {
      return <div className="empty-state">This view failed to load — check the console.</div>;
    }
    return this.props.children;
  }
}
