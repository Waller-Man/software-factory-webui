import type * as M from '../../../contracts/src/manage.ts';
import type { GatewayResult, GraphSnapshot, SnapshotOptions, ReadQuery, ReadData, NodeView } from '../../../contracts/src/gateway.ts';
export interface Requests {
    status: Record<string, never>;
    createDraft: M.CreateDraftRequest;
    listDrafts: M.ListDraftsRequest;
    getDraft: M.DraftIdRequest;
    updateDraft: M.UpdateDraftRequest;
    deleteDraft: M.RevisionRequest;
    stageCreate: M.StageCreateRequest;
    stageUpdate: M.StageUpdateRequest;
    stageDelete: M.StageDeleteRequest;
    stageMoveVersion: M.StageMoveVersionRequest;
    undoChange: M.UndoChangeRequest;
    previewChanges: M.RevisionRequest;
    commitChanges: M.CommitRequest;
    getReceipt: M.ReceiptRequest;
    reconcile: M.ReceiptRequest;
    ensureAssistant: M.AssistantRequest;
}
export interface Responses {
    status: M.ManageStatus;
    createDraft: M.ManageDraft;
    listDrafts: M.DraftSummary[];
    getDraft: M.ManageDraft;
    updateDraft: M.ManageDraft;
    deleteDraft: {
        deleted: true;
    };
    stageCreate: M.ManageDraft;
    stageUpdate: M.ManageDraft;
    stageDelete: M.ManageDraft;
    stageMoveVersion: M.ManageDraft;
    undoChange: M.ManageDraft;
    previewChanges: M.PreviewResult;
    commitChanges: M.CommitReceipt;
    getReceipt: M.CommitReceipt;
    reconcile: M.CommitReceipt;
    ensureAssistant: M.AssistantSession;
}
type Outer<T> = {
    ok: true;
    value: T;
} | {
    ok: false;
    error: unknown;
};
export type ManageRemote = {
    [K in keyof Requests]: (token: string, request: Requests[K], signal?: AbortSignal) => Promise<Outer<M.ManageResult<Responses[K]>>>;
};
export interface ReadRemote {
    snapshot(options: SnapshotOptions, signal?: AbortSignal): Promise<Outer<GatewayResult<GraphSnapshot>>>;
    read(query: ReadQuery, signal?: AbortSignal): Promise<Outer<GatewayResult<ReadData>>>;
}
export class ApiError extends Error {
    constructor(readonly code: string, message: string) { super(message); }
}
function outer<T>(value: Outer<T>): T { if (!value.ok)
    throw new ApiError('REMOTE_UNAVAILABLE', '服务连接不可用，请检查插件是否启用'); return value.value; }
export class Api {
    private session?: M.UiSession;
    private bootstrap?: Promise<M.UiSession>;
    constructor(private manage: () => ManageRemote | undefined, private gateway: () => ReadRemote | undefined, private fetcher: typeof fetch = (input, init) => globalThis.fetch(input, init)) { }
    private async token() {
        if (this.session && Date.parse(this.session.expiresAt) - Date.now() > 30000)
            return this.session.token;
        this.bootstrap ??= (async () => {
            const response = await this.fetcher('/api/sf-manage/ui-session', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: '{}' });
            if (!response.ok)
                throw new ApiError('UI_AUTH_REQUIRED', '请登录 DSH，并从同源软件工厂界面操作');
            const result = await response.json() as M.ManageResult<M.UiSession>;
            if (!result.ok)
                throw new ApiError(result.error.code, result.error.message);
            this.session = result.data;
            return result.data;
        })();
        try {
            return (await this.bootstrap).token;
        }
        finally {
            this.bootstrap = undefined;
        }
    }
    async call<K extends keyof Requests>(method: K, request: Requests[K], signal?: AbortSignal): Promise<Responses[K]> {
        const remote = this.manage();
        if (!remote)
            throw new ApiError('MANAGE_UNAVAILABLE', 'Manage插件未启用，概览仍可浏览');
        const token = await this.token();
        const invoke = remote[method] as (token: string, request: Requests[K], signal?: AbortSignal) => Promise<Outer<M.ManageResult<Responses[K]>>>;
        const result = outer(await invoke.call(remote, token, request, signal));
        if (!result.ok) {
            if (result.error.code === 'UNAUTHORIZED')
                this.session = undefined;
            throw new ApiError(result.error.code, result.error.message);
        }
        return result.data;
    }
    async snapshot(signal?: AbortSignal) {
        const remote = this.gateway();
        if (!remote)
            throw new ApiError('GATEWAY_UNAVAILABLE', '请启用只读 Gateway 插件');
        const result = outer(await remote.snapshot({ includeVersions: true, detail: 'full', maxDepth: 16, maxNodes: 1000, maxEdges: 3000 }, signal));
        if (!result.ok)
            throw new ApiError(result.error.code, result.error.message);
        if (result.meta.apiVersion !== '1.0' || !Array.isArray(result.data.nodes) || !result.data.nodes.every(node => typeof node.vertexId === 'string'))
            throw new ApiError('GATEWAY_CONTRACT', 'Gateway契约不兼容，需要read API 1.0的nodes/vertexId');
        return { graph: result.data, complete: result.meta.complete && !result.meta.truncated };
    }
    async fieldGroups(signal?: AbortSignal): Promise<NodeView[]> {
        const remote = this.gateway();
        if (!remote) throw new ApiError('GATEWAY_UNAVAILABLE', 'Gateway未启用');
        const items: NodeView[] = []; let offset = 0, fingerprint: string | undefined;
        do {
            const result = outer(await remote.read({ kind: 'field_groups', limit: 100, offset, expectedFingerprint: fingerprint }, signal));
            if (!result.ok) throw new ApiError(result.error.code, result.error.message);
            if (!('kind' in result.data) || result.data.kind !== 'field_groups' || !result.meta.complete || result.meta.truncated) throw new ApiError('READ_INCOMPLETE', '字段定义未完整读取');
            items.push(...result.data.items);
            if (!result.data.page.hasMore) return items;
            const next = result.data.page.nextOffset;
            if (next === null || next <= offset || next > 2000) throw new ApiError('READ_INCOMPLETE', '字段定义超过读取范围');
            offset = next; fingerprint = result.meta.fingerprint;
        } while (true);
    }
    async node(vertexId: string, signal?: AbortSignal) {
        const remote = this.gateway();
        if (!remote)
            throw new ApiError('GATEWAY_UNAVAILABLE', 'Gateway未启用');
        let offset = 0, fingerprint: string | undefined;
        let first: Extract<ReadData, {
            kind: 'node';
        }> | undefined;
        do {
            const result = outer(await remote.read({ kind: 'node', vertexId, limit: 100, offset, expectedFingerprint: fingerprint }, signal));
            if (!result.ok)
                throw new ApiError(result.error.code, result.error.message);
            if (!('kind' in result.data) || result.data.kind !== 'node' || !result.meta.complete || result.meta.truncated)
                throw new ApiError('READ_INCOMPLETE', '节点关系未完整读取');
            if (!first)
                first = structuredClone(result.data);
            else {
                first.relations.push(...result.data.relations);
                first.neighbors.push(...result.data.neighbors);
            }
            if (!result.data.page.hasMore)
                return first;
            fingerprint = result.meta.fingerprint;
            const next = result.data.page.nextOffset;
            if (next === null || next <= offset || next > 2000)
                throw new ApiError('READ_INCOMPLETE', '节点关系超过读取范围');
            offset = next;
        } while (true);
    }
    dispose() { this.session = undefined; }
}
