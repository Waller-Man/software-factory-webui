import type { ConfirmRequest, PrepareRequest, Result, ReviewPlan, RunBinding, Selection, SessionBinding, SessionRequest } from '../../../../orchestration/src/types.ts';
type Outer<T> = { ok: true; value: Result<T> } | { ok: false; error?: { message?: string } };
export interface SelectionRemote {
  ensureSession(token: string, request: SessionRequest): Promise<Outer<SessionBinding>>;
  getSelection(token: string, request: { selectionId: string }): Promise<Outer<Selection>>;
  prepareRun(token: string, request: PrepareRequest): Promise<Outer<ReviewPlan>>;
  confirmRun(token: string, request: ConfirmRequest): Promise<Outer<RunBinding>>;
}
export class SelectionClient {
  private remote?: SelectionRemote;
  private authorization?: { token: string; expiresAt: number };
  private pending?: Promise<string>;
  private listeners = new Set<() => void>();
  getSnapshot = () => this.remote;
  subscribe = (fn: () => void) => { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; };
  setRemote(remote?: SelectionRemote) { this.remote = remote; this.authorization = undefined; for (const fn of this.listeners) fn(); }
  private async token() {
    if (this.authorization && this.authorization.expiresAt > Date.now() + 30000) return this.authorization.token;
    if (this.pending) return this.pending;
    this.pending = (async () => {
      const response = await globalThis.fetch('/api/sf-orchestration/ui-session', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error?.message ?? '请登录 DSH');
      this.authorization = result.data; return result.data.token as string;
    })();
    try { return await this.pending; } finally { this.pending = undefined; }
  }
  private async call<T>(fn: (remote: SelectionRemote, token: string) => Promise<Outer<T>>): Promise<T> {
    const remote = this.remote; if (!remote) throw new Error('Agent 编排插件未就绪，请启用后重试');
    const result = await fn(remote, await this.token());
    if (!result.ok) throw new Error(result.error?.message ?? '远程请求失败');
    if (!result.value.ok) throw new Error(result.value.error.message);
    return result.value.data;
  }
  session(request: SessionRequest) { return this.call((r, t) => r.ensureSession(t, request)); }
  get(id: string) { return this.call((r, t) => r.getSelection(t, { selectionId: id })); }
  prepare(request: PrepareRequest) { return this.call((r, t) => r.prepareRun(t, request)); }
  confirm(request: ConfirmRequest) { return this.call((r, t) => r.confirmRun(t, request)); }
}

