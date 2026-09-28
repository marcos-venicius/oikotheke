import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "./Button";

interface State {
  error: Error | null;
}

/** Last-resort fallback so a rendering bug never leaves a blank window. */
export class ErrorBoundary extends Component<{ children: ReactNode; onReset?: () => void }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Unhandled UI error", error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-sm font-medium">Something went wrong</p>
        <p className="max-w-md text-xs break-words text-muted">{this.state.error.message}</p>
        <Button
          className="mt-2"
          onClick={() => {
            this.setState({ error: null });
            this.props.onReset?.();
          }}
        >
          Back to library
        </Button>
      </div>
    );
  }
}
