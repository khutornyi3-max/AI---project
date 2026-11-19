import { Component, type ErrorInfo, type ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    let readable = 'Сталася непередбачена помилка під час роботи додатка.';
    if (error.message) {
      try {
        const parsed = JSON.parse(error.message) as { error?: string };
        if (parsed?.error) {
          readable =
            parsed.error.includes('Missing or insufficient permissions')
              ? 'Недостатньо прав доступу для виконання цієї операції в хмарному сховищі. Спробуйте увійти повторно.'
              : parsed.error;
        }
      } catch {
        readable = error.message;
      }
    }
    return { hasError: true, message: readable };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('App ErrorBoundary caught:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#F6F7F9] flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <h1 className="font-display text-lg font-bold text-slate-950">
              Щось пішло не так
            </h1>
            <p className="text-sm text-slate-600 leading-relaxed">
              {this.state.message}
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="px-4 py-2 text-sm font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
            >
              Оновити сторінку
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
