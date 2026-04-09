import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  startProgressHeartbeat,
  maybeStartHeartbeat,
  type ProgressNotificationSender,
} from "../../src/utils/progress.js";

describe("startProgressHeartbeat", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("emits progress notification after interval", async () => {
    const send = vi.fn<ProgressNotificationSender>().mockResolvedValue(undefined);
    const hb = startProgressHeartbeat("tok-1", send, 1000);

    vi.advanceTimersByTime(1000);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith({
      method: "notifications/progress",
      params: {
        progressToken: "tok-1",
        progress: 1,
        message: expect.stringContaining("elapsed"),
      },
    });

    hb.stop();
  });

  it("increments tick on each interval", async () => {
    const send = vi.fn<ProgressNotificationSender>().mockResolvedValue(undefined);
    const hb = startProgressHeartbeat("tok-2", send, 500);

    vi.advanceTimersByTime(1500);
    expect(send).toHaveBeenCalledTimes(3);

    const ticks = send.mock.calls.map((c) => c[0].params.progress);
    expect(ticks).toEqual([1, 2, 3]);

    hb.stop();
  });

  it("stops emitting after stop()", async () => {
    const send = vi.fn<ProgressNotificationSender>().mockResolvedValue(undefined);
    const hb = startProgressHeartbeat("tok-3", send, 500);

    vi.advanceTimersByTime(500);
    expect(send).toHaveBeenCalledTimes(1);

    hb.stop();

    vi.advanceTimersByTime(2000);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("works with numeric progress tokens", async () => {
    const send = vi.fn<ProgressNotificationSender>().mockResolvedValue(undefined);
    const hb = startProgressHeartbeat(42, send, 1000);

    vi.advanceTimersByTime(1000);
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        params: expect.objectContaining({ progressToken: 42 }),
      }),
    );

    hb.stop();
  });

  it("silently ignores send failures and continues emitting", async () => {
    const send = vi.fn<ProgressNotificationSender>().mockRejectedValue(new Error("send failed"));
    const hb = startProgressHeartbeat("tok-4", send, 500);

    vi.advanceTimersByTime(1500);
    // All three ticks fire despite rejections
    expect(send).toHaveBeenCalledTimes(3);

    hb.stop();
  });

  it("reports elapsed time in message", async () => {
    const send = vi.fn<ProgressNotificationSender>().mockResolvedValue(undefined);
    const hb = startProgressHeartbeat("tok-5", send, 5000);

    vi.advanceTimersByTime(5000);
    const msg = send.mock.calls[0][0].params.message;
    expect(msg).toMatch(/\d+s elapsed/);

    hb.stop();
  });
});

describe("maybeStartHeartbeat", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts heartbeat when progressToken is present", async () => {
    const send = vi.fn<ProgressNotificationSender>().mockResolvedValue(undefined);
    const hb = maybeStartHeartbeat({ progressToken: "abc" }, send, 500);

    vi.advanceTimersByTime(500);
    expect(send).toHaveBeenCalledTimes(1);

    hb.stop();
  });

  it("returns no-op when no token is present", () => {
    const send = vi.fn<ProgressNotificationSender>().mockResolvedValue(undefined);
    const hb = maybeStartHeartbeat({}, send, 500);

    vi.advanceTimersByTime(2000);
    expect(send).not.toHaveBeenCalled();

    // stop() should not throw
    hb.stop();
  });

  it("returns no-op when meta is undefined", () => {
    const send = vi.fn<ProgressNotificationSender>().mockResolvedValue(undefined);
    const hb = maybeStartHeartbeat(undefined, send, 500);

    vi.advanceTimersByTime(2000);
    expect(send).not.toHaveBeenCalled();

    hb.stop();
  });
});
