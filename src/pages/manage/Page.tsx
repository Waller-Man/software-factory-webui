import { useState } from 'react';
import type { Controller, State } from '../../shared/controller.ts';
import { DraftPicker } from '../../shared/DraftPicker.tsx';
import { Review } from '../../shared/Review.tsx';
import { defaultCatalog, fieldIdentity } from './fields.ts';
import { FieldEditor } from './FieldEditor.tsx';
import { keyOf, labelOf, refOf } from '../overview/graph.ts';
import { SplitLayout } from '../../shared/SplitLayout.tsx';
export function ManagePage({ controller: c, state: s }: {
    controller: Controller;
    state: State;
}) {
    const [query, setQuery] = useState('');
    const { fields, groups } = s.fieldCatalog ?? defaultCatalog;
    const graph = c.graph(), d = s.draft, step = d?.context.step ?? 0;
    const lockedVersion = c.editingVersion();
    const selectedId = lockedVersion ? keyOf(lockedVersion) : d?.context.selected ? keyOf(d.context.selected) : undefined, selected = graph?.nodes.find(n => n.vertexId === selectedId);
    const parentEdge = graph?.edges.find(e => e.inV === selectedId && e.label === 'HAS_VERSION'), agent = selected?.label === 'AgentVersion' ? graph?.nodes.find(n => n.vertexId === parentEdge?.outV) : selected?.label === 'Agent' ? selected : undefined;
    const capabilityEdge = graph?.edges.find(e => e.inV === agent?.vertexId && e.label === 'HAS_AGENT'), capability = selected?.label === 'Capability' ? selected : graph?.nodes.find(n => n.vertexId === capabilityEdge?.outV);
    return <>
    <header className="sf-header">
    <div>
    <h1>软件工厂入库</h1>
    <small>{selected?.label === 'AgentVersion' && !selected.vertexId.startsWith('draft:') ? '修改版本 · 自动预填当前值' : '新建逻辑 Agent / 子版本 · 对话辅助填写'}</small>
    </div>
    <div className="sf-actions">
    <DraftPicker controller={c} state={s}/>
    <button disabled={s.busy} onClick={() => void c.create('new-agent')}>新建入库草稿</button>
    <button disabled={s.busy} onClick={() => c.page('overview')}>返回概览</button>
    </div>
    </header>
    {!s.editing || !d ? <div className="sf-empty">
        <h2>准备 Agent 入库</h2>
        <p>先选择挂载位置和逻辑 Agent，再逐项填写八类字段。可以随时保留草稿，下次继续。</p>
        <button className="sf-primary" disabled={s.busy} onClick={() => void c.create('new-agent')}>开始入库</button>
        <p>也可在上方恢复已有草稿。</p>
        </div> : <SplitLayout className="sf-wizard" storageKey="manage-inner" stackAt={420} panes={[
        { id: 'steps', label: '入库步骤', initial: 22, min: 120, collapsible: true, children: <nav className="sf-steps" aria-label="入库步骤">{groups.map((group, index) => <button key={group} aria-current={step === index ? 'step' : undefined} disabled={s.busy || index > 0 && selected?.label !== 'AgentVersion'} onClick={() => void c.step(index)}>
            <span>{index}</span>{group}</button>)}</nav> },
        { id: 'form', label: '填写表单', initial: 78, min: 280, children: <div className="sf-form-pane">
        <main className="sf-form">
        <div className="sf-form-title">
        <span className="sf-kicker">STEP {String(step).padStart(2, '0')} / 08</span>
        <h2>{groups[step]}</h2>
        <p>{step === 0 ? lockedVersion ? '当前版本已锁定。只可选择逻辑 Agent 更换归属，版本ID与已有资料保持。' : '选择位置、逻辑 Agent 或版本；已有版本也从这里进入修改。' : '可手工填写或在右侧对话中请 AI 辅助。允许暂缺字段，提交时统一校验。'}</p>
        </div>
      {step === 0 ? <>
            <div className="sf-selection">
            <h3>当前对象与位置</h3>
            <dl>
            <dt>能力位置</dt>
            <dd>{capability ? labelOf(capability) : '待选择'}</dd>
            <dt>逻辑 Agent</dt>
            <dd>{agent ? labelOf(agent) : '待选择'}</dd>
            <dt>版本</dt>
            <dd>{selected?.label === 'AgentVersion' ? labelOf(selected) : '尚未创建或选择'}</dd>
            </dl>
            </div>
            <label>{lockedVersion ? '搜索新父级逻辑 Agent（能力分类和版本不可选）' : '搜索对应的逻辑 Agent、版本或能力分类'}<input aria-label="搜索入库对象" placeholder="输入名称、Agent ID…" value={query} onChange={e => setQuery(e.target.value)}/>
            </label>
            <div className="sf-object-list">{graph?.nodes.filter(n => n.pending !== 'delete' && `${labelOf(n)} ${n.properties.agent_id ?? ''} ${n.vertexId}`.toLowerCase().includes(query.toLowerCase())).slice(0, 150).map(n => <button key={n.vertexId} aria-pressed={(lockedVersion ? agent?.vertexId : selectedId) === n.vertexId} disabled={s.busy || !!lockedVersion && n.label !== 'Agent'} onClick={() => void c.choose(n.vertexId)}>
                <span className="sf-badge">{n.label}</span>
                <strong>{labelOf(n)}</strong>
                <small>{n.properties.agent_id ? String(n.properties.agent_id) : n.vertexId}</small>
                </button>)}</div>
            <div className="sf-actions">
            <button disabled={s.busy} onClick={() => void c.chooseInOverview()}>{lockedVersion ? '到概览选择新父级逻辑 Agent' : '到概览修改界面选择 / AI拟定位置'}</button>
            <button className="sf-primary" disabled={s.busy || !selected} onClick={() => selected && void c.prepareVersion(selected.vertexId)}>{lockedVersion ? '继续修改当前版本' : selected?.label === 'Capability' ? '在此创建 Agent 和版本' : selected?.label === 'Agent' ? '为此 Agent 创建子版本' : '使用此版本并继续'}</button>
            </div>
            <p>{lockedVersion ? '更换归属只加入草稿，不新建版本、不清空资料。可在最终预览撤销；人工保存后移除旧挂载并保留新挂载。' : '切换对象只改变当前填写目标；此前拟定的节点保留在本草稿，最终预览可逐项撤销。'}</p>
            </> : <>
        <div className="sf-selection">逻辑 Agent：{agent ? labelOf(agent) : '未找到'}　/　版本：{selected ? labelOf(selected) : '未选择'}<p>已有Agent的名称与逻辑能力描述是共享字段，在此只读，请从概览的逻辑Agent修改入口编辑。版本号及版本能力描述可修改，内部节点ID保持不变。</p>
            </div>
        {fields.filter(f => f.group === step).map(field => { const target = field.object === 'Agent' ? agent : selected; if (!target)
                return null; const value = target.properties[field.key]; const locked = !target.vertexId.startsWith('draft:') && field.object === 'Agent'; return <FieldEditor key={`${target.vertexId}:${fieldIdentity(field)}`} field={field} revision={d.revision} value={typeof value === 'string' ? value : undefined} locked={locked} busy={s.busy || d.state !== 'editing'} save={(text, clear, revision) => c.update(refOf(target.vertexId), clear ? {} : { [field.key]: text }, clear ? [field.key] : [], revision)}/>; })}
        {step === 8 && (d.context.origin === 'overview' ? <>
                <p>来自概览的向导与能力树共用同一草稿。返回概览后点击顶部保存，统一核对全部变更。</p>
                <button onClick={() => c.page('overview')}>暂存并返回概览</button>
                </> : <Review controller={c} state={s}/>)}
      </>}
        </main>
      <footer className="sf-wizard-footer">
        <button disabled={step === 0 || s.busy} onClick={() => void c.step(step - 1)}>上一项</button>
        <span>草稿 r{d.revision} · {new Date(d.updatedAt).toLocaleTimeString()}</span>
        <button disabled={step === 8 || s.busy || selected?.label !== 'AgentVersion'} onClick={() => void c.step(step + 1)}>下一项</button>
        </footer></div> }
        ]}/>}
  </>;
}
