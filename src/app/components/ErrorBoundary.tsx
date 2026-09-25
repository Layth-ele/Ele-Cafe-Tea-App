import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { captureError } from '@/lib/sentry';
import { isChunkLoadError, purgeAndReload, recoverFromStaleBundle } from '@/lib/chunkRecovery';

import { tNow } from '@/i18n/useT';
interface Props { children: React.ReactNode; fallback?: React.ReactNode; }
interface State { hasError: boolean; error: Error | null; isChunkError: boolean; }

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, isChunkError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, isChunkError: isChunkLoadError(error) };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack);
    // Auto-recover chunk-load errors transparently the first time we
    // see them this session. If we've already attempted a reload and
    // STILL got the same error, fall through to the normal fallback
    // UI so the user can take manual action — something deeper is
    // broken than a stale-bundle issue.
    // Stale bundle after a deploy (see lib/chunkRecovery): reload onto
    // the new build. Guarded against loops by a 60 s window, so a later
    // deploy in the same session still recovers.
    if (isChunkLoadError(error)) {
      recoverFromStaleBundle();
      // Don't bother Sentry with chunk-load errors. They're recoverable
      // deploy-rollover noise that says nothing about app health and
      // would dominate the error volume signal if reported.
      return;
    }
    // Phase 0.2 — forward genuine render errors to Sentry with the
    // React component stack as extra context. The stack is more
    // useful than the JS error stack for "which component blew up?".
    captureError(error, {
      area: 'react-render',
      componentStack: info.componentStack,
    });
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      // Chunk-load case: while purgeAndReload() is in flight (a few
      // hundred ms), show a friendlier "Updating to the latest
      // version…" message instead of "Something went wrong".
      if (this.state.isChunkError) {
        return (
          <div className="eb-wrap">
            <div className="eb-inner">
              <div className="eb-icon-circle">
                <RefreshCw size={28} className="icon-spin eb-icon-update" />
              </div>
              <h2 className="eb-h2">
                {tNow('Updating to the latest version…')}
              </h2>
              <p className="eb-msg">
                {tNow("A new version of the site is available. We're refreshing automatically — this should only take a moment.")}
              </p>
              <button
                onClick={() => purgeAndReload()}
                className="btn btn-dark eb-btn"
              >
                {tNow('Reload now')}
              </button>
            </div>
          </div>
        );
      }

      // In production, show a friendly generic message — never leak the
      // raw error.message to customers. A "FirebaseError: Missing or
      // insufficient permissions" or "Cannot read properties of
      // undefined" is scary, unhelpful, and exposes internals. The full
      // error is still logged to the console in componentDidCatch above
      // so engineers can debug from DevTools without us putting raw
      // strings in the UI. In dev, show the message inline for fast
      // iteration.
      const isDev = (import.meta as ImportMeta & { env: { DEV?: boolean } }).env?.DEV;
      const message = isDev
        ? (this.state.error?.message || 'An unexpected error occurred.')
        : tNow('An unexpected error occurred. Please reload to try again.');

      return (
        <div className="eb-wrap">
          <div className="eb-inner">
            <div className="eb-icon-circle eb-icon-circle-danger">
              <AlertTriangle size={28} className="icon-shake eb-icon-danger" />
            </div>
            <h2 className="eb-h2">
              {tNow('Something went wrong')}
            </h2>
            <p className="eb-msg">
              {message}
            </p>
            {/* A fresh reload (new build, clean caches) — re-rendering the
                same broken tree would just fail again. */}
            <button
              onClick={() => { void purgeAndReload(); }}
              className="btn btn-dark eb-btn"
            >
              <RefreshCw size={14} className="icon-hover-spin" /> {tNow('Try again')}
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
