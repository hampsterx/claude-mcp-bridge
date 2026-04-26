/** Default interval between heartbeat notifications. */
const DEFAULT_INTERVAL_MS = 15_000;

export interface ProgressHeartbeat {
  stop: () => void;
}

/**
 * Function signature for sending MCP progress notifications.
 * Matches the shape of `extra.sendNotification` from tool handlers.
 */
export type ProgressNotificationSender = (notification: {
  method: "notifications/progress";
  params: {
    progressToken: string | number;
    progress: number;
    total?: number;
    message?: string;
  };
}) => Promise<void>;

/**
 * Start a periodic progress heartbeat that emits MCP `notifications/progress`.
 *
 * Used for long-running operations (search, query) to signal liveness
 * to the MCP client. The first notification fires after `intervalMs`.
 * Notifications are fire-and-forget; failures are silently ignored (not all
 * clients support progress notifications).
 *
 * @param progressToken - Opaque token from the client's request `_meta.progressToken`
 * @param sendNotification - The notification sender from the tool handler's `extra` context
 * @param intervalMs - Milliseconds between heartbeats (default: 15000)
 */
export function startProgressHeartbeat(
  progressToken: string | number,
  sendNotification: ProgressNotificationSender,
  intervalMs: number = DEFAULT_INTERVAL_MS,
): ProgressHeartbeat {
  const startTime = Date.now();
  let tick = 0;

  const timer = setInterval(() => {
    tick++;
    const elapsed = Math.round((Date.now() - startTime) / 1000);
    sendNotification({
      method: "notifications/progress",
      params: {
        progressToken,
        progress: tick,
        message: `Processing... (${elapsed}s elapsed)`,
      },
    }).catch(() => {
      // Fire-and-forget: client may not support progress notifications
    });
  }, intervalMs);

  return {
    stop() {
      clearInterval(timer);
    },
  };
}

/**
 * Helper to conditionally start a heartbeat only when the client provided a progress token.
 * Returns a no-op stop function when no token is present.
 */
export function maybeStartHeartbeat(
  meta: { progressToken?: string | number } | undefined,
  sendNotification: ProgressNotificationSender,
  intervalMs?: number,
): ProgressHeartbeat {
  const token = meta?.progressToken;
  if (token === undefined) {
    return { stop() {} };
  }
  return startProgressHeartbeat(token, sendNotification, intervalMs);
}
