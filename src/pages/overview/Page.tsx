import { useEffect, useMemo, useRef, useState } from 'react';
import type { MouseEvent } from 'react';
import type { DraftContext } from '../../../../contracts/src/manage.ts';
import type { Controller, State } from '../../shared/controller.ts';
import { DraftPicker } from '../../shared/DraftPicker.tsx';
import { Review } from '../../shared/Review.tsx';
import { Canvas } from './Canvas.tsx';
import { NodeDetails } from './Details.tsx';
import { rows, filtered, emptyFilters, labelOf, refOf, keyOf } from './graph.ts';
import type { GraphNode, TreeRow, Filters } from './graph.ts';
import { SplitLayout } from '../../shared/SplitLayout.tsx';
export function OverviewPage({ controller: c, state: s }: {
    controller: Controller;
    state: State;
}) {
    const [filters, setFilters] = useState<Filters>(emptyFilters), [collapsed, setCollapsed] = useState<Set<string>>(), [searchCollapsed, setSearchCollapsed] = useState(new Set<string>()), [menu, setMenu] = useState<{
        x: number;
        y: number;
        node: GraphNode;
    }>(), [form, setForm] = useState<{
        action: 'rename' | 'Capability' | 'Agent';
        node: GraphNode;
        revision: number;
        previousContext?: DraftContext;
    }>(), [name, setName] = useState(''), [agentId, setAgentId] = useState(''), [description, setDescription] = useState(''), [review, setReview] = useState(false);
    const graph = c.graph();
    const allRows = useMemo(() => graph ? rows(graph, new Set(), null) : [], [s.graph, s.draft, s.editing]);
    const defaults = useMemo(() => new Set(allRows.filter(row => row.depth > 0).map(row => row.key)), [allRows]);
    const visible = useMemo(() => graph ? filtered(graph, filters) : null, [s.graph, s.draft, s.editing, filters]);
    const tree = useMemo(() => graph ? rows(graph, visible ? searchCollapsed : collapsed ?? defaults, visible) : [], [s.graph, s.draft, s.editing, collapsed, defaults, visible, searchCollapsed]);
    useEffect(() => setSearchCollapsed(new Set()), [filters]);
    const revealed = useRef<string>();
    useEffect(() => {
        if (!s.selected) { revealed.current = undefined; return; }
        if (revealed.current === s.selected) return;
        const row = allRows.find(row => row.node.vertexId === s.selected);
        if (!row) return;
        revealed.current = s.selected;
        const path = JSON.parse(row.key) as string[];
        setCollapsed(old => {
            const next = new Set(old ?? defaults);
            for (let i = 1; i < path.length; i++) next.delete(JSON.stringify(path.slice(0, i)));
            return next;
        });
    }, [s.selected, allRows, defaults]);
    const toggle = (key: string) => {
        const change = (old: Set<string> | undefined) => { const next = new Set(old ?? defaults); if (!next.delete(key)) next.add(key); return next; };
        if (visible) setSearchCollapsed(change);
        else setCollapsed(change);
    };
    const selected = graph?.nodes.find(n => n.vertexId === s.selected), isRoot = menu?.node.vertexId === graph?.rootId;
    const canDelete = menu && graph && !isRoot && !graph.edges.some(e => e.outV === menu.node.vertexId && graph.nodes.find(n => n.vertexId === e.inV)?.pending !== 'delete');
    const showMenu = (e: MouseEvent, row: TreeRow) => { if (!s.editing || s.draft?.state !== 'editing' || row.node.pending === 'delete' || s.selecting && c.editingVersion())
        return; e.preventDefault(); setMenu({ x: Math.min(e.clientX, window.innerWidth - 225), y: Math.min(e.clientY, window.innerHeight - 220), node: row.node }); };
    const editForm = async (action: 'rename' | 'Capability' | 'Agent') => {
        if (!menu || !s.draft) return;
        const target = menu.node, previousContext = action === 'rename' && target.label === 'Agent' ? s.draft.context : undefined;
        setMenu(undefined);
        const draft = previousContext ? await c.startAgentEdit(target.vertexId) : s.draft;
        if (!draft) return;
        const node = c.graph()?.nodes.find(node => node.vertexId === target.vertexId) ?? target;
        setName(action === 'rename' ? labelOf(node) : '');
        setAgentId(action === 'rename' ? String(node.properties.agent_id ?? '') : '');
        setDescription(action === 'rename' ? String(node.properties.description ?? '') : '');
        setForm({ action, node, revision: draft.revision, previousContext });
    };
    async function closeForm() {
        const context = form?.previousContext;
        setForm(undefined);
        if (context) await c.restoreContext(context);
    }
    async function saveForm() {
        if (!form) return;
        const draft = form.action === 'rename'
            ? await c.update(refOf(form.node.vertexId), { name, ...(form.node.label === 'Agent' ? { description } : {}) }, [], form.revision)
            : await c.add(form.action, refOf(form.node.vertexId), { name, ...(form.action === 'Agent' ? { ...(agentId ? { agent_id: agentId } : {}), ...(description ? { description } : {}) } : {}) });
        if (draft) await closeForm();
    }
    async function remove() {
        const node = menu?.node;
        setMenu(undefined);
        if (!node)
            return;
        if (node.vertexId.startsWith('draft:')) {
            await c.removeNode(refOf(node.vertexId));
            return;
        }
        await c.task(async () => {
            const data = await c.api.node(node.vertexId), parents = [...new Set(data.relations.filter(e => e.inV === node.vertexId).map(e => e.outV))];
            const deleted = new Set(s.draft?.changes.flatMap(change => change.kind === 'delete' ? [keyOf(change.target)] : []) ?? []);
            if (data.relations.some(e => e.outV === node.vertexId && !deleted.has(e.inV)))
                throw new Error('该节点仍有孩子，不能删除');
            if (parents.length > 1 && !window.confirm(`此叶节点有 ${parents.length} 个父级：\n${parents.map(id => labelOf(data.neighbors.find(n => n.vertexId === id) ?? { ...node, vertexId: id, properties: {} })).join('\n')}\n将删除此节点及全部挂载关系。是否加入删除草稿？`))
                return;
            const draft = await c.api.call('stageDelete', { ...c.revision(), target: refOf(node.vertexId), ...(parents.length > 1 ? { confirmedParentIds: parents } : {}) });
            c.set({ draft, preview: undefined });
        });
    }
    return <>
    <header className="sf-header">
    <div className="sf-heading">
    <span className="sf-brand">♧</span>
    <div>
    <h1>软件工厂概览</h1>
    <small>能力分类 · 逻辑 Agent · 版本</small>
    </div>
    </div>
    <div className="sf-metrics">
    <strong>{graph?.nodes.filter(n => n.label === 'Capability').length ?? 0}<small>能力分类</small>
    </strong>
    <strong>{graph?.nodes.filter(n => n.label === 'Agent').length ?? 0}<small>逻辑 Agent</small>
    </strong>
    <strong>{graph?.nodes.filter(n => n.label === 'AgentVersion').length ?? 0}<small>版本</small>
    </strong>
    </div>
    <div className="sf-actions">
    <DraftPicker controller={c} state={s}/>
    <button disabled={s.busy} onClick={() => void c.load()}>刷新</button>{s.editing ? <>
        <button disabled={s.busy} className="sf-primary" onClick={() => { setReview(true); void c.preview(); }}>保存</button>
        <button disabled={s.busy} onClick={() => c.exit()}>退出修改</button>
        </> : <button className="sf-primary" disabled={s.busy || !s.complete} onClick={() => s.draft?.state === 'editing' ? void c.openDraft(s.draft.id) : void c.create()}>修改</button>}</div>
    </header>
    <div className="sf-controls">
    <input aria-label="搜索节点" placeholder="搜索名称、Agent ID 或版本…" value={filters.query} onChange={e => setFilters({ ...filters, query: e.target.value })}/>
    <select aria-label="筛选节点类型" value={filters.kind} onChange={e => setFilters({ ...filters, kind: e.target.value })}>
    <option value="">全部类型</option>{['Capability', 'Agent', 'AgentVersion'].map(k => <option key={k}>{k}</option>)}</select>
    <select aria-label="筛选启用状态" value={filters.status} onChange={e => setFilters({ ...filters, status: e.target.value })}>
    <option value="">全部状态</option>{['draft', 'enabled', 'disabled', 'able'].map(v => <option key={v}>{v}</option>)}</select>
    <input aria-label="筛选模型" placeholder="模型依赖" value={filters.model} onChange={e => setFilters({ ...filters, model: e.target.value })}/>
    <input aria-label="筛选处理对象" placeholder="处理对象类别" value={filters.category} onChange={e => setFilters({ ...filters, category: e.target.value })}/>
    <button onClick={() => visible ? setSearchCollapsed(new Set()) : setCollapsed(new Set())}>展开全部</button>
    <button onClick={() => visible ? setSearchCollapsed(defaults) : setCollapsed(defaults)}>收起分支</button>
    </div>
    {s.editing && <div className="sf-notice">{s.selecting ? c.editingVersion() ? '正在为当前版本选择新父级：只允许逻辑 Agent，能力分类与版本不可选；已有版本资料保持。' : '选择挂载位置、逻辑 Agent 或要修改的版本，然后返回入库向导。' : '编辑草稿：右键节点新增、修改或删除。改动尚未入库，点击顶部保存后人工确认。'}{s.selecting && <button disabled={!s.selected || s.busy || !c.canSelect(s.selected)} onClick={() => void c.useSelection()}>使用此选择并返回</button>}{s.selecting && <button disabled={s.busy} onClick={() => { const target = c.editingVersion(); c.set({ selecting: false, ...(target ? { selected: keyOf(target) } : {}) }); c.page('manage'); }}>取消位置选择</button>}</div>}
    {!s.complete && s.graph && <div role="alert" className="sf-error">概览结果被截断，暂不能修改，请检查Gateway读取限制。</div>}
    <div className="sf-overview" onClick={() => setMenu(undefined)}>
    <SplitLayout className="sf-overview-panes" storageKey={`overview-inner:${s.editing ? 'edit' : 'read'}`} stackAt={500} panes={[
      { id: 'tree', label: '能力树', initial: 22, min: 140, collapsible: true, children: <aside className="sf-tree">
    <small>{tree.length} 个位置</small>
    {tree.map(row => <div role="treeitem" tabIndex={0} aria-disabled={!c.canSelect(row.node.vertexId)} aria-selected={s.selected === row.node.vertexId} key={row.key} className="sf-tree-row" data-pending={row.node.pending} style={{ paddingLeft: row.depth * 14 + 4 }} onClick={() => c.select(row.node.vertexId)} onKeyDown={e => { if (e.key === 'Enter')
            c.select(row.node.vertexId); }} onContextMenu={e => showMenu(e, row)}>
        <button aria-label={row.expanded ? '收起节点' : '展开节点'} disabled={!row.expandable} onClick={e => { e.stopPropagation(); toggle(row.key); }}>{row.expandable ? row.expanded ? '▾' : '▸' : '·'}</button>
        <span className="sf-dot" data-kind={row.node.label}/>
        <span>{labelOf(row.node)}</span>{row.node.pending && <small>{({ create: '+', update: '改', delete: '删' })[row.node.pending]}</small>}{row.shared && <small>↗</small>}</div>)}{!tree.length && <p>暂无节点。可点击刷新读取。</p>}</aside> },
      { id: 'canvas', label: '画布', initial: 48, min: 180, children: <Canvas rows={tree} selected={s.selected} select={id => c.select(id)} selectable={id => c.canSelect(id)} toggle={toggle} menu={showMenu}/> },
      { id: 'details', label: '节点详情', initial: 30, min: 180, collapsible: true, children: <aside className="sf-detail"><NodeDetails node={selected} graph={graph} catalog={s.fieldCatalog}/></aside> }
    ]}/>
    </div>
    {menu && <div className="sf-context" role="menu" style={{ left: menu.x, top: menu.y }} onMouseLeave={() => setMenu(undefined)}>{menu.node.label === 'Capability' && <>
            <button role="menuitem" onClick={() => editForm('Capability')}>新增能力子节点</button>
            <button role="menuitem" onClick={() => editForm('Agent')}>新增逻辑 Agent 子节点</button>
            </>}{menu.node.label === 'Agent' && <button role="menuitem" onClick={() => { void c.wizard(menu.node.vertexId); setMenu(undefined); }}>新增子版本</button>}{!isRoot && <button role="menuitem" onClick={() => { if (menu.node.label === 'AgentVersion') {
            void c.wizard(menu.node.vertexId);
            setMenu(undefined);
        }
        else
            editForm('rename'); }}>修改该节点</button>}<button role="menuitem" disabled={!canDelete} onClick={() => void remove()}>删除该节点{!canDelete ? '（仅非根叶节点）' : ''}</button>
        </div>}
    {form && <div className="sf-dialog-backdrop">
        <form className="sf-dialog" onSubmit={e => { e.preventDefault(); void saveForm(); }}>
        <h3>{form.action === 'rename' ? form.node.label === 'Agent' ? '修改逻辑 Agent' : '修改分类名称' : form.action === 'Capability' ? '新增能力子节点' : '新增逻辑 Agent 子节点'}</h3>
        <p>父级/对象：{labelOf(form.node)}</p>
        <label>节点名称<input autoFocus required aria-label="节点名称" value={name} onChange={e => setName(e.target.value)}/></label>{(form.action === 'Agent' || form.action === 'rename' && form.node.label === 'Agent') && <>
            <label>稳定 Agent ID<input aria-label="稳定 Agent ID" value={agentId} readOnly={form.action === 'rename'} onChange={e => setAgentId(e.target.value)} placeholder="未知时暂缺"/>
            </label>
            <label>逻辑 Agent 能力描述<textarea aria-label="逻辑 Agent 能力描述" value={description} onChange={e => setDescription(e.target.value)}/>
            </label>
            </>}<p>{form.action === 'rename' && form.node.label === 'Agent' ? '仅加入草稿，ID保持不变。这里修改逻辑Agent名称和总体能力描述，不修改任何版本描述；关闭后恢复原填写流程。' : '仅加入草稿，最终人工保存后入库。新增Agent的未知字段可暂缺。'}</p>
        <div className="sf-actions">
        <button type="submit" className="sf-primary" disabled={s.busy}>加入草稿</button>
        <button type="button" disabled={s.busy} onClick={() => void closeForm()}>取消</button>
        </div>
        </form>
        </div>}
    {review && <div className="sf-dialog-backdrop">
        <section className="sf-dialog sf-wide">
        <button className="sf-close" onClick={() => { setReview(false); c.set({ preview: undefined }); }}>×</button>
        <Review controller={c} state={s}/>
        </section>
        </div>}
  </>;
}
