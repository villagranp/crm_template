import { Alert, AlertTitle, Box, Button } from '@mui/material';
import { Component, type ErrorInfo, type ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  message: string | null;
}

/**
 * Top-level render guard. Prevents a single broken subtree from blanking the
 * whole application. Rendering errors are reported to the console only; no
 * user data or token material is ever included.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { hasError: false, message: null };

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return {
      hasError: true,
      message: error instanceof Error ? error.message : 'Unexpected rendering error',
    };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Unhandled rendering error', error.message, info.componentStack);
  }

  private handleReload = (): void => {
    window.location.reload();
  };

  override render(): ReactNode {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <Box sx={{ p: 4, maxWidth: 640, mx: 'auto' }}>
        <Alert
          severity="error"
          action={
            <Button color="inherit" size="small" onClick={this.handleReload}>
              Reload
            </Button>
          }
        >
          <AlertTitle>Something went wrong</AlertTitle>
          {this.state.message}
        </Alert>
      </Box>
    );
  }
}
