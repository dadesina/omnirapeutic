/**
 * Retry Utility for Database Transactions
 *
 * Handles Prisma P2034 errors (serialization failures) that can occur
 * with SERIALIZABLE transaction isolation level under high contention.
 */

import { Prisma } from '@prisma/client';

export interface RetryOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  jitterFactor?: number;
}

const DEFAULT_OPTIONS: Required<RetryOptions> = {
  maxAttempts: 5,
  baseDelayMs: 10,
  maxDelayMs: 1000,
  jitterFactor: 0.1
};

/**
 * Calculate exponential backoff delay with jitter
 */
function calculateDelay(attempt: number, options: Required<RetryOptions>): number {
  const exponentialDelay = options.baseDelayMs * Math.pow(2, attempt);
  const cappedDelay = Math.min(exponentialDelay, options.maxDelayMs);
  const jitter = cappedDelay * options.jitterFactor * (Math.random() - 0.5);
  return Math.floor(cappedDelay + jitter);
}

/**
 * Check if error is a Prisma P2034 serialization failure
 */
function isSerializationFailure(error: any): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2034'
  );
}

/**
 * Retry a database operation with exponential backoff
 *
 * This function automatically retries operations that fail due to
 * serialization conflicts (P2034) which can occur under high contention
 * with SERIALIZABLE transaction isolation.
 *
 * @param operation - Async function to execute
 * @param options - Retry configuration options
 * @returns Result of the operation
 * @throws Original error if max retries exceeded or error is not retryable
 *
 * @example
 * ```typescript
 * const result = await withRetry(async () => {
 *   return await prisma.$transaction(async (tx) => {
 *     // Your transactional code here
 *   }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
 * });
 * ```
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  let lastError: any;

  for (let attempt = 0; attempt < opts.maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      // Only retry on serialization failures
      if (!isSerializationFailure(error)) {
        throw error;
      }

      // Don't sleep after the last attempt
      if (attempt < opts.maxAttempts - 1) {
        const delayMs = calculateDelay(attempt, opts);
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }
  }

  // If we exhausted all retries, throw the last error
  throw lastError;
}

/**
 * Retry metrics for monitoring and observability
 */
export class RetryMetrics {
  private static retryCount = 0;
  private static failureCount = 0;

  static incrementRetry(): void {
    this.retryCount++;
  }

  static incrementFailure(): void {
    this.failureCount++;
  }

  static getMetrics(): { retries: number; failures: number } {
    return {
      retries: this.retryCount,
      failures: this.failureCount
    };
  }

  static reset(): void {
    this.retryCount = 0;
    this.failureCount = 0;
  }
}

/**
 * Enhanced retry with metrics tracking
 */
export async function withRetryMetrics<T>(
  operation: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  let lastError: any;
  let attemptsMade = 0;

  for (let attempt = 0; attempt < opts.maxAttempts; attempt++) {
    attemptsMade++;
    try {
      const result = await operation();

      // Track retries (only if we retried at least once)
      if (attempt > 0) {
        RetryMetrics.incrementRetry();
      }

      return result;
    } catch (error) {
      lastError = error;

      // Only retry on serialization failures
      if (!isSerializationFailure(error)) {
        throw error;
      }

      // Don't sleep after the last attempt
      if (attempt < opts.maxAttempts - 1) {
        const delayMs = calculateDelay(attempt, opts);
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }
  }

  // Track failures (exhausted all retries)
  RetryMetrics.incrementFailure();
  throw lastError;
}
