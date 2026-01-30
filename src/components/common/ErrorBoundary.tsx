"use client";

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { reportError } from '@/utils/errorReporting';

interface Props {
    children: ReactNode;
    fallback?: ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
    public state: State = {
        hasError: false,
        error: null,
    };

    public static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        reportError(error, { componentStack: errorInfo.componentStack || '' });
    }

    private handleReload = () => {
        window.location.reload();
    };

    public render() {
        if (this.state.hasError) {
            if (this.props.fallback) {
                return this.props.fallback;
            }

            return (
                <div style={fallbackStyle}>
                    <h2 style={{ fontSize: '1.5rem', marginBottom: '1rem', color: '#ff4444' }}>Something went wrong.</h2>
                    <p style={{ marginBottom: '2rem', color: '#ccc' }}>
                        We apologize for the inconvenience. The error has been reported.
                    </p>
                    <button onClick={this.handleReload} style={buttonStyle}>
                        Reload Page
                    </button>
                    {process.env.NODE_ENV === 'development' && this.state.error && (
                        <pre style={codeStyle}>
                            {this.state.error.toString()}
                        </pre>
                    )}
                </div>
            );
        }

        return this.props.children;
    }
}

const fallbackStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100vh',
    backgroundColor: '#000',
    color: '#fff',
    padding: '20px',
    textAlign: 'center',
};

const buttonStyle: React.CSSProperties = {
    padding: '12px 24px',
    backgroundColor: '#333',
    color: '#fff',
    border: '1px solid #555',
    borderRadius: '8px',
    cursor: 'pointer',
    fontSize: '1rem',
    marginTop: '10px',
};

const codeStyle: React.CSSProperties = {
    marginTop: '40px',
    padding: '20px',
    backgroundColor: '#111',
    border: '1px solid #333',
    borderRadius: '8px',
    textAlign: 'left',
    maxWidth: '800px',
    overflow: 'auto',
    color: '#ff8888',
    fontSize: '0.9rem',
};
