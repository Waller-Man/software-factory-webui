import type { ConversationMatch, ConversationNodeDefinition } from '@deepseek-ai/dsh-client-ui-conversation/client';

export const RUN_TOOL = 'sf_runtime_run_tool';
export const RUN_TURN_KEY = 'software-factory-runs';
export interface RunReference { runId: string; title?: string }
export interface RunHistory { turn: number; calls: Record<string, string | undefined>; runs: RunReference[] }
declare module '@deepseek-ai/dsh-client-ui-conversation/client' {
    interface ConversationTurnDataMap { 'software-factory-runs': RunReference[] }
}
export function acceptedRun(content: readonly { type: string; text?: string }[]): string | undefined {
    for (const block of content) {
        if (block.type !== 'text' || !block.text) continue;
        try {
            const value = JSON.parse(block.text);
            if (value?.ok === true && value.data?.status === 'queued' && typeof value.data.runId === 'string' &&
                /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.data.runId)) return value.data.runId;
        } catch { /* Other tool text remains in the native receipt. */ }
    }
}
export function reduceRunHistory(state: RunHistory, event: ConversationMatch['event']): RunHistory {
    if (event.type === 'tool/call' && event.data.name === RUN_TOOL) {
        let title: string | undefined;
        try { const args = JSON.parse(event.data.arguments); if (typeof args.toolId === 'string') title = args.toolId; } catch { /* Partial arguments. */ }
        return { ...state, calls: { ...state.calls, [event.data.callId]: title } };
    }
    if (event.type !== 'tool/result' || event.data.message.isError ||
        !Object.hasOwn(state.calls, event.data.message.toolCallId)) return state;
    const runId = acceptedRun(event.data.message.content);
    if (!runId || state.runs.some(run => run.runId === runId)) return state;
    return { ...state, runs: [...state.runs, { runId, title: state.calls[event.data.message.toolCallId] }] };
}
/** Rebuilt from durable native calls/results. No task snapshots are written to chat. */
export const runDefinition: ConversationNodeDefinition<RunHistory> = {
    kind: RUN_TURN_KEY,
    match: event => event.type === 'tool/result' || event.type === 'tool/call' && event.data.name === RUN_TOOL
        ? { id: String(event.data.turn), role: 'start' } : null,
    start: (_context, match) => {
        const event = match.event;
        const turn = event.type === 'tool/call' || event.type === 'tool/result' ? event.data.turn : 0;
        return reduceRunHistory({ turn, calls: {}, runs: [] }, event);
    },
    update: (context, match) => reduceRunHistory(context.state, match.event),
    buildLocationData: (context, scope, previous) => {
        if (scope !== 'turn' || !context.state) return null;
        if (previous?.key === RUN_TURN_KEY && previous.value === context.state.runs) return previous;
        return { kind: 'turn', turn: context.state.turn, key: RUN_TURN_KEY, value: context.state.runs };
    },
};
