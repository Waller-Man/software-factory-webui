import type { ConversationMatch, ConversationNodeDefinition } from '@deepseek-ai/dsh-client-ui-conversation/client';
export const SELECTION_TOOL = 'submit_agent_selection', SELECTION_KEY = 'software-factory-selections';
export interface SelectionHistory { turn: number; calls: string[]; ids: string[] }
declare module '@deepseek-ai/dsh-client-ui-conversation/client' { interface ConversationTurnDataMap { 'software-factory-selections': string[] } }
export function selectionId(content: readonly { type: string; text?: string }[]): string | undefined {
  for (const c of content) if (c.type === 'text' && c.text) { try { const v = JSON.parse(c.text); if (v?.ok === true && typeof v.data?.selectionId === 'string') return v.data.selectionId; } catch {} }
}
export function reduceSelection(state: SelectionHistory, e: ConversationMatch['event']): SelectionHistory {
  if (e.type === 'tool/call' && e.data.name === SELECTION_TOOL) return { ...state, calls: [...state.calls, e.data.callId] };
  if (e.type !== 'tool/result' || e.data.message.isError || !state.calls.includes(e.data.message.toolCallId)) return state;
  const id = selectionId(e.data.message.content);
  return id && !state.ids.includes(id) ? { ...state, ids: [...state.ids, id] } : state;
}
export const selectionDefinition: ConversationNodeDefinition<SelectionHistory> = {
  kind: SELECTION_KEY,
  match: e => e.type === 'tool/result' || e.type === 'tool/call' && e.data.name === SELECTION_TOOL ? { id: String(e.data.turn), role: 'start' } : null,
  start: (_context, match) => { const e = match.event; return reduceSelection({ turn: e.type === 'tool/call' || e.type === 'tool/result' ? e.data.turn : 0, calls: [], ids: [] }, e); },
  update: (context, match) => reduceSelection(context.state, match.event),
  buildLocationData: (context, scope, previous) => {
    if (scope !== 'turn' || !context.state) return null;
    if (previous?.key === SELECTION_KEY && previous.value === context.state.ids) return previous;
    return { kind: 'turn', turn: context.state.turn, key: SELECTION_KEY, value: context.state.ids };
  },
};

