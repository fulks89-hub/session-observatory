import type { Session } from './types.ts';
export type Attention = {
  kind: 'input' | 'approval';
  label: string;
  detail: string;
  confirmed: boolean;
  stale: boolean;
};
export function sessionAttention(s: Session, now = Date.now()): Attention | null {
  const stale = s.provenance !== 'demo' && now - Date.parse(s.updatedAt) > 600_000;
  if (s.runtime === 'waiting_approval' || s.runtime === 'waiting_input') {
    const approval = s.runtime === 'waiting_approval';
    return {
      kind: approval ? 'approval' : 'input',
      label: stale
        ? 'Last seen waiting on you'
        : approval
          ? 'Your approval needed'
          : 'Waiting on you',
      detail: approval
        ? 'Review the request in the original app. Sending a message here does not grant tool permission.'
        : 'The session reported that it needs your reply.',
      confirmed: true,
      stale,
    };
  }
  if (
    s.runtime === 'idle' &&
    (!s.reviewedAt || s.reviewedAt < s.updatedAt) &&
    /(?:waiting for (?:your|you)|need your (?:input|decision|confirmation)|please (?:choose|confirm|review|approve)|would you (?:like|prefer)|which (?:option|approach) (?:do|would) you)/i.test(
      s.latest,
    )
  )
    return {
      kind: 'input',
      label: 'Reply may be needed',
      detail: 'Suggested from the latest message. Open the session to confirm.',
      confirmed: false,
      stale,
    };
  return null;
}
