/** The channel id from the public build env (`VITE_CHANNEL_ID`), when configured. */
export function channelIdFromEnv(): string | undefined {
  const id = import.meta.env.VITE_CHANNEL_ID;
  return id && id.trim() ? id.trim() : undefined;
}

/**
 * Build a `https://t.me/c/<id>/<msg>` deep link for a private channel message.
 * Returns `null` when the channel id or message id is missing, or the channel id
 * is not numeric (public `@name` channels have no `/c/` link).
 */
export function buildChannelUrl(
  channelId: string | undefined | null,
  messageId: number | null | undefined,
): string | null {
  if (!channelId) return null;
  if (messageId === null || messageId === undefined) return null;
  const numeric = channelId.replace(/^-100/, '').replace(/^-/, '');
  if (!/^\d+$/.test(numeric)) return null;
  return `https://t.me/c/${numeric}/${messageId}`;
}
