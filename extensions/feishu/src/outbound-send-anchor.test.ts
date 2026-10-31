import { PlatformMessageNotDispatchedError } from "openclaw/plugin-sdk/error-runtime";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ChannelOutboundAdapter } from "../runtime-api.js";
import { withFeishuOutboundSendAnchor } from "./outbound-send-anchor.js";
import { captureFeishuSendAuthority } from "./send-context.js";

const { mockResolveAnchor } = vi.hoisted(() => ({ mockResolveAnchor: vi.fn() }));

// mock-isolation: the anchor lookup is the unit under test; no provider I/O is exercised.
vi.mock("./send.js", () => ({
  resolveFeishuReplyAnchorMessageId: mockResolveAnchor,
}));

type SendTextContext = Parameters<NonNullable<ChannelOutboundAdapter["sendText"]>>[0];

function fakeAdapter() {
  const sendText = vi.fn(async (ctx: SendTextContext) => ({
    channel: "feishu",
    messageId: "om_out",
    to: ctx.to,
  }));
  const adapter: ChannelOutboundAdapter = { deliveryMode: "direct", sendText };
  return { sendText, wrapped: withFeishuOutboundSendAnchor(adapter) };
}

const ctx = {
  cfg: {} as SendTextContext["cfg"],
  to: "chat:oc_group",
  accountId: "work",
  text: "hi",
  threadId: "omt_topic",
};

describe("withFeishuOutboundSendAnchor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("replies with the topic's root message instead of the topic id", async () => {
    mockResolveAnchor.mockImplementationOnce(async () => {
      // The credentialed lookup must run inside the sender scope.
      expect(captureFeishuSendAuthority()).toBeTypeOf("function");
      return "om_topic_root";
    });
    const { sendText, wrapped } = fakeAdapter();
    const controller = new AbortController();

    await wrapped.sendText?.({ ...ctx, signal: controller.signal });

    expect(mockResolveAnchor).toHaveBeenCalledWith({
      cfg: ctx.cfg,
      threadId: "omt_topic",
      accountId: "work",
    });
    expect(sendText).toHaveBeenCalledWith(expect.objectContaining({ threadId: "om_topic_root" }));
  });

  it("fences the topic lookup before the provider read is submitted", async () => {
    mockResolveAnchor.mockImplementationOnce(async () => {
      captureFeishuSendAuthority()?.();
      return "om_topic_root";
    });
    const { sendText, wrapped } = fakeAdapter();
    const controller = new AbortController();
    controller.abort();

    await expect(wrapped.sendText?.({ ...ctx, signal: controller.signal })).rejects.toBeInstanceOf(
      PlatformMessageNotDispatchedError,
    );
    expect(sendText).not.toHaveBeenCalled();
  });
});
