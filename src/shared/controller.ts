import type { GraphSnapshot } from '../../../contracts/src/gateway.ts';
import type { ManageDraft, DraftSummary, NodeKind, NodeRef, PreviewResult, CommitReceipt, DraftMode, DraftContext } from '../../../contracts/src/manage.ts';
import { Api, ApiError } from './api.ts';
import { buildFieldCatalog, defaultCatalog, type FieldCatalog } from '../pages/manage/fields.ts';
import { overlay, keyOf, refOf, labelOf } from '../pages/overview/graph.ts';
export interface State {
    fieldCatalog?: FieldCatalog;
    graph?: GraphSnapshot;
    complete: boolean;
    draft?: ManageDraft;
    drafts: DraftSummary[];
    editing: boolean;
    selecting: boolean;
    selected?: string;
    busy: boolean;
    error?: string;
    notice?: string;
    preview?: PreviewResult;
    receipt?: CommitReceipt;
    page: 'overview' | 'manage';
    assistant?: {
        sessionId: string;
        workspace: string;
    };
    assistantError?: string;
}
export class Controller {
    private state: State = { complete: false, drafts: [], editing: false, selecting: false, busy: false, page: 'overview' };
    private listeners = new Set<() => void>();
    private queue: Promise<unknown> = Promise.resolve();
    private life = new AbortController();
    constructor(readonly api: Api, private navigate: (page: 'overview' | 'manage') => void, private sourceSession: () => string | undefined = () => undefined) { }
    getSnapshot = () => this.state;
    subscribe = (listener: () => void) => { this.listeners.add(listener); return () => this.listeners.delete(listener); };
    set(patch: Partial<State>) { this.state = { ...this.state, ...patch }; for (const listener of this.listeners)
        listener(); }
    async task<T>(fn: () => Promise<T>): Promise<T | undefined> {
        const job = this.queue.then(async () => { this.set({ busy: true, error: undefined }); try {
            return await fn();
        }
        catch (error) {
            this.set({ error: error instanceof Error ? error.message : '操作未完成' });
            if (error instanceof ApiError && error.code === 'REVISION_CONFLICT' && this.state.draft) {
                try { await this.reloadDraft(); } catch { /* Preserve local input and the original conflict message. */ }
            }
            return undefined;
        }
        finally {
            this.set({ busy: false });
        } });
        this.queue = job.catch(() => { });
        return job;
    }
    async load() { return this.task(async () => {
        const [result, catalog] = await Promise.all([this.api.snapshot(this.life.signal), this.api.fieldGroups(this.life.signal).then(buildFieldCatalog).catch(() => ({ ...defaultCatalog, warning: '字段定义读取失败，暂使用内置字段。' }))]);
        this.set({ ...result, fieldCatalog: catalog, ...(catalog.warning ? { notice: catalog.warning } : {}) }); await this.list();
    }); }
    async refreshDrafts() { await this.list(); }
    private async list() { try {
        this.set({ drafts: await this.api.call('listDrafts', {}, this.life.signal) });
    }
    catch (error) {
        this.set({ notice: error instanceof Error ? error.message : 'Manage不可用' });
    } }
    async reloadDraft() { const current = this.state.draft; if (!current)
        return; const draft = await this.api.call('getDraft', { draftId: current.id }, this.life.signal); if (this.state.draft?.id === draft.id)
        this.set({ draft }); }
    async poll() { if (this.state.busy || !this.state.editing || this.state.preview || !this.state.draft)
        return; const before = this.state.draft; try {
        const draft = await this.api.call('getDraft', { draftId: before.id });
        if (!this.state.busy && this.state.editing && this.state.draft?.id === draft.id && draft.revision > this.state.draft.revision) {
            const latest = draft.changes.at(-1);
            this.set({ draft, ...(latest?.kind === 'create' ? { selected: latest.ref } : {}) });
        }
    }
    catch { /* Visible actions report errors without timer noise. */ } }
    private draft() { const draft = this.state.draft; if (!draft || draft.state !== 'editing')
        throw new Error('请选择可编辑草稿'); return draft; }
    revision() { const d = this.draft(); return { draftId: d.id, expectedRevision: d.revision }; }
    private remember(id?: string) { try {
        if (id)
            sessionStorage.setItem('software-factory-draft', id);
        else
            sessionStorage.removeItem('software-factory-draft');
    }
    catch { } }
    async resume() { let id: string | null = null; try {
        id = sessionStorage.getItem('software-factory-draft');
    }
    catch { } if (id)
        await this.openDraft(id); }
    async create(mode: DraftMode = 'overview') { return this.task(async () => { const draft = await this.api.call('createDraft', { mode, title: mode === 'overview' ? '能力树修改' : 'Agent入库' }); this.set({ draft, editing: true, selected: undefined, preview: undefined, receipt: undefined, assistant: undefined }); this.remember(draft.id); await this.list(); void this.assist(); }); }
    async openDraft(id: string) { return this.task(async () => { const draft = await this.api.call('getDraft', { draftId: id }); this.set({ draft, editing: true, selected: draft.context.selected ? keyOf(draft.context.selected) : undefined, preview: undefined, receipt: undefined, assistant: undefined }); this.remember(id); if (draft.lastCommitRequestId)
        this.set({ receipt: await this.api.call('getReceipt', { draftId: id, requestId: draft.lastCommitRequestId }) }); if (draft.state === 'editing')
        void this.assist(); }); }
    async removeDraft(id: string) { return this.task(async () => { const draft = await this.api.call('getDraft', { draftId: id }); await this.api.call('deleteDraft', { draftId: id, expectedRevision: draft.revision }); if (this.state.draft?.id === id) {
        this.set({ draft: undefined, editing: false, assistant: undefined, preview: undefined, receipt: undefined });
        this.remember();
    } await this.list(); }); }
    exit() { this.set({ editing: false, selecting: false, preview: undefined, assistant: undefined, notice: '草稿已保留，可在下拉列表恢复' }); }
    editingVersion(): NodeRef | undefined {
        const context = this.state.draft?.context;
        if (context?.editingVersion) return context.editingVersion;
        return context?.selected && this.graph()?.nodes.some(node => node.vertexId === keyOf(context.selected!) && node.label === 'AgentVersion') ? context.selected : undefined;
    }
    canSelect(id: string): boolean {
        return !this.state.selecting || !this.editingVersion() || this.graph()?.nodes.some(node => node.vertexId === id && node.label === 'Agent' && node.pending !== 'delete') === true;
    }
    select(id: string) { if (this.canSelect(id)) this.set({ selected: id }); }
    graph() { return this.state.graph ? overlay(this.state.graph, this.state.editing ? this.state.draft : undefined) : undefined; }
    async add(label: NodeKind, parent: NodeRef, properties: Record<string, string>) { return this.task(async () => { const draft = await this.api.call('stageCreate', { ...this.revision(), label, parent, properties }); const change = draft.changes.at(-1); this.set({ draft, preview: undefined, selected: change?.kind === 'create' ? change.ref : undefined }); return draft; }); }
    async update(target: NodeRef, set: Record<string, string>, unset: string[] = [], expectedRevision?: number) { return this.task(async () => { const draft = await this.api.call('stageUpdate', { ...this.revision(), ...(expectedRevision !== undefined ? { expectedRevision } : {}), target, set, unset }); this.set({ draft, preview: undefined }); return draft; }); }
    async startAgentEdit(id: string) { return this.task(async () => {
        const node = this.graph()?.nodes.find(node => node.vertexId === id);
        if (node?.label !== 'Agent' || node.pending === 'delete') throw new Error('请选择可修改的逻辑Agent');
        const draft = await this.api.call('updateDraft', { ...this.revision(), context: { step: 0, origin: 'overview', selected: refOf(id) } });
        this.set({ draft, selected: id, preview: undefined }); return draft;
    }); }
    async restoreContext(context: DraftContext) { return this.task(async () => {
        const draft = await this.api.call('updateDraft', { ...this.revision(), context }); this.set({ draft });
    }); }
    async removeNode(target: NodeRef, parents?: string[]) { return this.task(async () => { const draft = await this.api.call('stageDelete', { ...this.revision(), target, ...(parents ? { confirmedParentIds: parents } : {}) }); this.set({ draft, preview: undefined }); }); }
    async undo(changeId: string) { return this.task(async () => { const draft = await this.api.call('undoChange', { ...this.revision(), changeId }); this.set({ draft, preview: undefined }); }); }
    page(page: 'overview' | 'manage') { this.set({ page }); this.navigate(page); }
    async wizard(id?: string) { return this.task(async () => { if (!this.state.editing || !this.state.draft)
        throw new Error('请先点击修改或新建草稿'); const version = this.graph()?.nodes.find(node => node.vertexId === id && node.label === 'AgentVersion'); const draft = await this.api.call('updateDraft', { ...this.revision(), context: { step: 0, origin: 'overview', ...(id ? { selected: refOf(id) } : {}), ...(version ? { editingVersion: refOf(version.vertexId) } : {}) } }); this.set({ draft, selected: id }); this.page('manage'); }); }
    async step(step: number) { return this.task(async () => { const d = this.draft(); const draft = await this.api.call('updateDraft', { ...this.revision(), context: { ...d.context, step } }); this.set({ draft }); }); }
    async chooseInOverview() {
        const target = this.editingVersion(), parent = target && this.graph()?.edges.find(edge => edge.label === 'HAS_VERSION' && edge.inV === keyOf(target));
        this.set({ selecting: true, ...(target ? { selected: parent?.outV } : {}) }); this.page('overview');
    }
    private async moveVersion(parentId: string) {
        const target = this.editingVersion();
        if (!target) throw new Error('请先确定要修改的版本');
        const draft = await this.api.call('stageMoveVersion', { ...this.revision(), target, parent: refOf(parentId) });
        this.set({ draft, selected: keyOf(target), preview: undefined });
        return draft;
    }
    async useSelection() { return this.task(async () => { const id = this.state.selected, node = this.graph()?.nodes.find(n => n.vertexId === id); if (!id || !node || node.pending === 'delete')
        throw new Error('请选择有效位置或版本'); const target = this.editingVersion();
        if (target) { if (node.label !== 'Agent') throw new Error('修改版本时只能选择逻辑Agent作为新父级'); await this.moveVersion(id); }
        const draft = await this.api.call('updateDraft', { ...this.revision(), context: { ...this.draft().context, step: 0, selected: target ?? refOf(id), ...(!target && node.label === 'AgentVersion' ? { editingVersion: refOf(id) } : {}) } }); this.set({ draft, selected: target ? keyOf(target) : id, selecting: false }); this.page('manage'); }); }
    async choose(id: string) { return this.task(async () => {
        if (this.editingVersion()) { await this.moveVersion(id); return; }
        const node = this.graph()?.nodes.find(node => node.vertexId === id);
        const draft = await this.api.call('updateDraft', { ...this.revision(), context: { ...this.draft().context, step: 0, selected: refOf(id), ...(node?.label === 'AgentVersion' ? { editingVersion: refOf(id) } : {}) } }); this.set({ draft, selected: id }); }); }
    async prepareVersion(id: string) {
        return this.task(async () => {
            const graph = this.graph()!, node = graph.nodes.find(n => n.vertexId === id);
            if (!node || node.pending === 'delete')
                throw new Error('请选择挂载位置或逻辑Agent');
            const locked = this.editingVersion();
            if (locked) {
                if (id !== keyOf(locked)) { if (node.label !== 'Agent') throw new Error('修改版本时只能选择逻辑Agent作为新父级'); await this.moveVersion(id); }
                const draft = await this.api.call('updateDraft', { ...this.revision(), context: { ...this.draft().context, selected: locked, editingVersion: locked, step: 1 } });
                this.set({ draft, selected: keyOf(locked) }); return;
            }
            let draft = this.draft(), target = id;
            if (node.label === 'Capability') {
                draft = await this.api.call('stageCreate', { ...this.revision(), label: 'Agent', parent: refOf(id), properties: {} });
                this.set({ draft });
                target = (draft.changes.at(-1) as {
                    ref: string;
                }).ref;
            }
            if (node.label !== 'AgentVersion') {
                draft = await this.api.call('stageCreate', { ...this.revision(), label: 'AgentVersion', parent: refOf(target), properties: {} });
                this.set({ draft });
                target = (draft.changes.at(-1) as {
                    ref: string;
                }).ref;
            }
            draft = await this.api.call('updateDraft', { ...this.revision(), context: { ...draft.context, selected: refOf(target), editingVersion: refOf(target), step: 1 } });
            this.set({ draft, selected: target });
        });
    }
    async preview() { return this.task(async () => { const preview = await this.api.call('previewChanges', this.revision()); this.set({ preview, receipt: undefined }); }); }
    async commit() {
        return this.task(async () => {
            const preview = this.state.preview;
            if (!preview)
                throw new Error('请重新预览变更');
            // No automatic retry: a disconnected commit can already have changed the database.
            try {
                const receipt = await this.api.call('commitChanges', { ...this.revision(), planId: preview.plan.id, digest: preview.plan.digest, approvalNonce: preview.approvalNonce });
                this.set({ receipt, preview: undefined });
                await this.afterReceipt(receipt);
            }
            catch (error) {
                this.set({ notice: '保存结果尚未确定，请点击“回读保存结果”，不要另建草稿重复提交' });
                throw error;
            }
        });
    }
    async reconcile() { return this.task(async () => { const id = this.state.receipt?.requestId ?? this.state.preview?.plan.id; if (!id || !this.state.draft)
        throw new Error('没有可回读的保存请求'); const receipt = await this.api.call('reconcile', { draftId: this.state.draft.id, requestId: id }); this.set({ receipt }); await this.afterReceipt(receipt); }); }
    private async afterReceipt(receipt: CommitReceipt) { await this.reloadDraft(); if (receipt.state === 'succeeded') {
        const result = await this.api.snapshot();
        const target = this.state.selected;
        this.set({ ...result, editing: false, selecting: false, assistant: undefined, selected: target ? receipt.bindings[target] ?? target : Object.values(receipt.bindings).at(-1), notice: '保存成功，概览已刷新' });
        this.remember();
        this.page('overview');
        await this.list();
    } }
    async assist() { const id = this.state.draft?.id; if (!id || !this.state.editing)
        return; this.set({ assistantError: undefined }); try {
        const assistant = await this.api.call('ensureAssistant', { draftId: id, sourceSessionId: this.sourceSession() });
        if (this.state.draft?.id === id && this.state.editing)
            this.set({ assistant });
    }
    catch (error) {
        if (this.state.draft?.id === id)
            this.set({ assistantError: error instanceof Error ? error.message : 'AI未就绪' });
    } }
    dispose() { this.life.abort(); this.api.dispose(); this.listeners.clear(); }
}
