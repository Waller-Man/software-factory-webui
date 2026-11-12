import type { Artifact, CancelResult, RunRecord, RunUpdate, RuntimeResult, WaitRunRequest, ModelCallRecord, AnswerInteractionRequest, InteractionAccepted, InteractionRecord } from '../../../../contracts/src/runtime.ts';
import type { ModelCatalog, SessionOpenWorkspacePathRequest } from '@deepseek-ai/dsh-api-session-controller/types';
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol';

export interface SessionRemote {
    modelCatalog(): Promise<RemoteResult<ModelCatalog>>;
    openWorkspacePath(request: SessionOpenWorkspacePathRequest, signal?: AbortSignal): Promise<RemoteResult<unknown>>;
}

type Outer<T> = { ok: true; value: RuntimeResult<T> } | { ok: false; error: { message?: string } };
export interface RuntimeRemote {
    listInteractions?(session: string, request: { runId: string }, signal?: AbortSignal): Promise<Outer<InteractionRecord[]>>;
    answerInteraction?(session: string, request: AnswerInteractionRequest, uiToken: string, signal?: AbortSignal): Promise<Outer<InteractionAccepted>>;
    getRun(session: string, request: { runId: string }, signal?: AbortSignal): Promise<Outer<RunRecord>>;
    waitRun(session: string, request: WaitRunRequest, signal?: AbortSignal): Promise<Outer<RunUpdate>>;
    cancelRun(session: string, request: { runId: string }, signal?: AbortSignal): Promise<Outer<CancelResult>>;
    getArtifact(session: string, request: { runId: string; artifactId: string }, signal?: AbortSignal): Promise<Outer<Artifact>>;
    getModelCall?(session: string, request: { runId: string; requestId: string }, signal?: AbortSignal): Promise<Outer<ModelCallRecord>>;
}
export class RuntimeClient {
    private remote?: RuntimeRemote;
    private session?: SessionRemote;
    private listeners = new Set<() => void>();
    private authorization?: { token: string; expiresAt: number };
    getSnapshot = () => this.remote;
    getSessionSnapshot = () => this.session;
    subscribe = (fn: () => void) => { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; };
    setRemote(remote?: RuntimeRemote): void { this.remote = remote; this.authorization = undefined; for (const fn of this.listeners) fn(); }
    setSession(session?: SessionRemote): void { this.session = session; for (const fn of this.listeners) fn(); }
    async answer(session: string, request: AnswerInteractionRequest, signal: AbortSignal) {
        const remote = this.remote;
        if (!remote?.answerInteraction) throw new Error('人工交互需要新版 Runtime / Human interaction requires an updated Runtime');
        if (!this.authorization || this.authorization.expiresAt < Date.now() + 30000) {
            const response = await fetch('/api/sf-runtime/ui-session', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: '{}', signal });
            const result = await response.json();
            if (!response.ok || !result.ok) throw new Error(result.error?.message ?? '请登录 DSH');
            if (this.remote !== remote) throw new Error('连接已变化，请重新操作');
            this.authorization = result.data;
        }
        signal.throwIfAborted();
        return unwrap(remote.answerInteraction(session, request, this.authorization!.token, signal));
    }
}
export async function unwrap<T>(promise: Promise<Outer<T>>): Promise<T> {
    const outer = await promise;
    if (!outer.ok) throw new Error(outer.error?.message ?? 'Remote 请求失败');
    if (!outer.value.ok) throw new Error(outer.value.error.message);
    return outer.value.data;
}
/** Accept only Runtime's authorized download route, never arbitrary artifact URLs. */
export function downloadHref(raw: string | undefined, session: string, runId: string, artifactId: string, base: string): string {
    if (!raw) throw new Error('产物下载地址不可用');
    const url = new URL(raw, base);
    if (url.username || url.password || url.origin !== new URL(base).origin || url.pathname !== '/api/sf-runtime/download' ||
        url.searchParams.get('sessionId') !== session || url.searchParams.get('runId') !== runId ||
        url.searchParams.get('artifactId') !== artifactId) throw new Error('产物下载地址无效');
    return url.href;
}
