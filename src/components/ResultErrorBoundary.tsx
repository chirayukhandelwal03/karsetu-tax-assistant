import React from "react";

type State = { error: Error | null };

export default class ResultErrorBoundary extends React.Component<
  { children: React.ReactNode },
  State
> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error("Result render crash:", error, info);
  }

  render() {
    if (this.state.error) {
      const raw = (() => {
        try {
          return sessionStorage.getItem("karsetu_result") || "(empty)";
        } catch {
          return "(unavailable)";
        }
      })();
      return (
        <div className="min-h-screen bg-background px-4 py-10">
          <div className="max-w-3xl mx-auto bg-white border border-kred/30 rounded-xl p-6 space-y-4">
            <h1 className="font-heading font-bold text-xl text-ink">
              Couldn't render the result page
            </h1>
            <p className="text-sm text-ink-soft">
              The computation finished but the response was shaped differently than the
              result page expects. This is a bug on our side, not your data.
            </p>
            <div className="bg-kred-pale border border-kred/30 rounded p-3">
              <div className="text-xs font-semibold text-kred mb-1">Error</div>
              <pre className="text-xs whitespace-pre-wrap break-words text-ink-soft">
                {this.state.error.message}
                {"\n\n"}
                {this.state.error.stack?.split("\n").slice(0, 6).join("\n")}
              </pre>
            </div>
            <details className="text-xs">
              <summary className="cursor-pointer text-blue-mid font-semibold">
                Show raw AI response (for debugging)
              </summary>
              <pre className="mt-2 bg-muted/30 rounded p-3 overflow-auto max-h-96 text-[11px] whitespace-pre-wrap break-words">
                {raw}
              </pre>
            </details>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  sessionStorage.clear();
                  window.location.href = "/compute";
                }}
                className="px-4 py-2 rounded-md bg-blue-light text-white text-sm font-semibold"
              >
                Start over
              </button>
              <button
                onClick={() => window.location.reload()}
                className="px-4 py-2 rounded-md border border-border text-sm"
              >
                Reload
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
