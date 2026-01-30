/**
 * Centralized error reporting utility.
 * Can be extended to send errors to Sentry, LogRocket, or a custom API.
 */
export const reportError = (error: Error, info?: { componentStack: string }) => {
    // Log to console in development (and production for now)
    console.error("[Error Reported]:", error);

    if (info) {
        console.error("[Error Info]:", info);
    }

    // TODO: Add Sentry or other service integration here
    // if (process.env.NODE_ENV === 'production') {
    //     Sentry.captureException(error);
    // }
};
