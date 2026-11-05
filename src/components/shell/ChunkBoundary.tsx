"use client";

import { Component, type ReactNode } from "react";

/**
 * Contains a failed React.lazy chunk to the piece of UI that needed it. Without
 * this, a chunk that fails to load (flaky network, or a deploy landing between
 * the HTML and the chunk fetch) throws past the dashboard layout to
 * global-error and blanks the whole app — and React caches the failed lazy
 * load, so even "Try again" cannot recover it.
 */
export class ChunkBoundary extends Component<
  { fallback: ReactNode; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.error(
      "[shell] lazy chunk failed",
      error instanceof Error ? error.message : error
    );
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
