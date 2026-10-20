import type { ChannelMessageActionContext } from "openclaw/plugin-sdk/channel-contract";
import { normalizeOptionalString } from "openclaw/plugin-sdk/string-coerce-runtime";
import { resolveFeishuReplyMode } from "./outbound.js";
import { resolveFeishuTopicAutoThreadAnchor } from "./topic-anchors.js";

export function readFirstString(
  params: Record<string, unknown>,
  keys: string[],
  fallback?: string | null,
): string | undefined {
  for (const key of keys) {
    const value = normalizeOptionalString(params[key]);
    if (value) {
      return value;
    }
  }
  return normalizeOptionalString(fallback);
}

export function resolveFeishuActionTarget(ctx: {
  params: Record<string, unknown>;
  toolContext?: { currentChannelId?: string } | null;
}): string | undefined {
  return readFirstString(ctx.params, ["to", "target"], ctx.toolContext?.currentChannelId);
}

export function resolveFeishuMessageId(params: Record<string, unknown>): string | undefined {
  return readFirstString(params, ["messageId", "message_id", "replyTo", "reply_to"]);
}

type FeishuActionReplyAnchor = {
  replyToMessageId: string | undefined;
  replyInThread: boolean;
};

type FeishuSendActionContext = Pick<
  ChannelMessageActionContext,
  "action" | "cfg" | "params" | "sessionKey" | "toolContext" | "requesterAccountId" | "reply"
>;

export async function buildFeishuSendReplyAnchor(
  ctx: FeishuSendActionContext,
  accountId: string,
): Promise<FeishuActionReplyAnchor> {
  if (ctx.action === "thread-reply") {
    return {
      replyToMessageId: resolveFeishuMessageId(ctx.params),
      replyInThread: true,
    };
  }
  const threadId =
    readFirstString(ctx.params, ["threadId"]) ??
    resolveFeishuTopicAutoThreadAnchor(ctx, accountId, resolveFeishuActionTarget(ctx));
  // Core also writes implicit reply IDs into params; they must not override
  // native topic delivery. Only an explicit reply can choose normal reply mode.
  const replyToId = ctx.reply
    ? ctx.reply.source === "implicit" && threadId
      ? undefined
      : ctx.reply.replyToId
    : readFirstString(ctx.params, ["replyTo", "reply_to"]);
  return resolveFeishuReplyMode({ replyToId, threadId });
}
