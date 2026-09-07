// Only a real UUID can select the installed Codex handler's existing-thread branch.
// Reserved route words such as "new" must never be accepted from transcript data.
export function nativeThreadHref(session: {
  provider: string;
  sourceId: string;
  provenance: string;
}): string | null {
  if (session.provider !== 'codex' || session.provenance === 'demo') return null;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(session.sourceId))
    return null;
  return `codex://threads/${session.sourceId}`;
}
