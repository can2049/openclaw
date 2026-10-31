import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ChannelOutboundAdapter } from "../runtime-api.js";
import { withFeishuOutboundSendAnchor } from "./outbound-send-anchor.js";

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
    mockResolveAnchor.mockResolvedValueOnce("om_topic_root");
    const { sendText, wrapped } = fakeAdapter();

    await wrapped.sendText?.(ctx);

    expect(mockResolveAnchor).toHaveBeenCalledWith({
      cfg: ctx.cfg,
      threadId: "omt_topic",
      accountId: "work",
    });
    expect(sendText).toHaveBeenCalledWith(expect.objectContaining({ threadId: "om_topic_root" }));
  });

  it("passes a message anchor through unchanged", async () => {
    mockResolveAnchor.mockResolvedValueOnce("om_reply_target");
    const { sendText, wrapped } = fakeAdapter();
    const messageCtx = { ...ctx, threadId: "om_reply_target" };

    await wrapped.sendText?.(messageCtx);

    expect(sendText).toHaveBeenCalledWith(messageCtx);
  });
});
