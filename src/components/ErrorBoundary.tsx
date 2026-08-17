import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';

type ErrorBoundaryProps = {
  children: ReactNode;
};

type ErrorBoundaryState = {
  error: Error | null;
};

/**
 * Catches render-time and module-load errors (e.g. missing Supabase config)
 * and shows a readable screen instead of a blank page.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Application error:', error, info);
  }

  render(): ReactNode {
    if (!this.state.error) return this.props.children;

    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
        <div className="w-full max-w-lg rounded-2xl border border-rose-200 bg-white p-8 text-center shadow-sm">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-rose-100 text-2xl">
            ⚠️
          </div>
          <h1 className="mt-4 text-lg font-semibold text-slate-900">Something went wrong</h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">{this.state.error.message}</p>
          <p className="mt-4 text-xs text-slate-400">
            Fix the issue (usually a missing value in <code className="rounded bg-slate-100 px-1 py-0.5">.env</code>), then reload the page.
          </p>
        </div>
      </div>
    );
  }
}
