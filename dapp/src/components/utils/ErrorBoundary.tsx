import type { ComponentType, ReactNode } from "react";
import { Component } from "react";
import { Button } from "components/ui";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/** Catches descendant React errors and renders fallback or retry UI. */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  override componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    if (import.meta.env.DEV) {
      console.error("ErrorBoundary caught an error:", error, errorInfo);
    }
  }

  override render(): ReactNode {
    if (this.state.hasError && this.state.error) {
      if (this.props.fallback) {
        return this.props.fallback;
      }
      return (
        <div
          className="rounded-control border border-danger/40 bg-danger-soft p-6 text-danger"
          role="alert"
        >
          <h3 className="font-semibold">Something went wrong</h3>
          <p className="mt-2 text-sm">
            {this.state.error.message || "An unexpected error occurred."}
          </p>
          <Button
            tone="secondary"
            className="mt-4"
            onClick={() => this.setState({ hasError: false, error: null })}
          >
            Try again
          </Button>
        </div>
      );
    }
    return this.props.children;
  }
}

/** A page island that shows its errors instead of going blank. */
export function withErrorBoundary<P extends object>(
  Island: ComponentType<P>,
): ComponentType<P> {
  return (props: P) => (
    <ErrorBoundary>
      <Island {...props} />
    </ErrorBoundary>
  );
}
