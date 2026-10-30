import type { Controller, State } from './controller.ts';
import { FieldValue, PropertyGroups, fieldTitle, kindTitle } from './FieldDisplay.tsx';
import { keyOf, labelOf } from '../pages/overview/graph.ts';
export function Review({ controller: c, state: s }: { controller: Controller; state: State }) {
    const graph = c.graph();
    const catalog = s.fieldCatalog;
    const kind = (id: string) => graph?.nodes.find(node => node.vertexId === id)?.label ?? s.draft?.bases[id]?.label;
    const name = (id: string) => { const node = graph?.nodes.find(node => node.vertexId === id); return node ? labelOf(node) : String(s.draft?.bases[id]?.properties.name ?? '相关节点'); };
    const operations = { create_node: '新增节点', create_edge: '建立挂载', update_node: '修改资料', unset_properties: '清空可选资料', delete_edge: '移除挂载', delete_node: '删除叶节点' };
    return <div className="sf-review">
    <h3>变更预览与人工保存</h3>
    <p>共有 {s.draft?.changes.length ?? 0} 项草稿变更。只有点击人工确认后才会写入数据库。</p>
    {s.draft?.changes.map(change => <details key={change.id}>
        <summary>{change.kind === 'create' ? '新增' : change.kind === 'update' ? '修改' : change.kind === 'move-version' ? '更换版本归属' : '删除'} · {change.kind === 'create' ? change.properties.name ?? change.properties.version ?? kindTitle(change.label) : name(keyOf(change.target))}</summary>
        {change.kind === 'create' ? <><p>挂载到：{name(keyOf(change.parent))}</p><PropertyGroups catalog={catalog} kind={change.label} properties={change.properties}/></> : change.kind === 'update' ? <dl className="sf-properties">{Object.entries(change.set).map(([field, value]) => <div key={field}><dt>{fieldTitle(field, kind(keyOf(change.target)), catalog)}</dt><dd><FieldValue field={field} kind={kind(keyOf(change.target))} catalog={catalog} value={value}/></dd></div>)}{change.unset.map(field => <div key={field}><dt>{fieldTitle(field, kind(keyOf(change.target)), catalog)}</dt><dd>清空此可选属性</dd></div>)}</dl> : change.kind === 'delete' ? <p>删除该叶节点及其挂载关系。此操作尚未入库。</p> : null}
        {change.kind === 'move-version' && <p>原逻辑Agent：{name(change.fromParentId)} → 新逻辑Agent：{name(keyOf(change.parent))}。保留同一版本ID及全部版本资料，人工保存后解除旧挂载。</p>}
        <button disabled={s.busy || s.draft?.state !== 'editing'} onClick={() => void c.undo(change.id)}>撤销这项变更</button>
        </details>)}
    <button disabled={s.busy || !s.draft?.changes.length || s.draft.state !== 'editing'} onClick={() => void c.preview()}>校验并生成保存预览</button>
    {s.preview && <div className="sf-approval" role="region" aria-label="人工保存确认">
        <p>请核对以下确定的数据库操作。批准绑定草稿 r{s.preview.plan.revision}；内容变化后需重新预览。</p>{s.preview.plan.steps.map(step => <details key={step.index} open>
            <summary>{step.index + 1}. {operations[step.operation]}{step.beforeNode || step.afterNode ? ' · ' + ((step.afterNode ?? step.beforeNode)!.properties.name ?? (step.afterNode ?? step.beforeNode)!.properties.version ?? kindTitle((step.afterNode ?? step.beforeNode)!.label)) : ''}</summary>
            {step.edge && <p>{name(step.edge.outV)} → {name(step.edge.inV)}</p>}
            {step.operation === 'update_node' || step.operation === 'unset_properties' ? <dl className="sf-properties">{[...Object.keys(step.set ?? {}), ...(step.unset ?? [])].map(field => <div key={field}><dt>{fieldTitle(field, (step.afterNode ?? step.beforeNode)?.label, catalog)}</dt><dd><small>修改前</small><div><FieldValue field={field} kind={step.beforeNode?.label} catalog={catalog} value={step.beforeNode?.properties[field]}/></div><small>保存后</small><div>{step.unset?.includes(field) ? '清空（不再声明）' : <FieldValue field={field} kind={step.afterNode?.label} catalog={catalog} value={step.afterNode?.properties[field]}/>}</div></dd></div>)}</dl> : <>
            {step.beforeNode && <div><strong>删除前资料</strong><PropertyGroups catalog={catalog} kind={step.beforeNode.label} properties={step.beforeNode.properties}/></div>}
            {step.afterNode && <div><strong>保存后资料</strong><PropertyGroups catalog={catalog} kind={step.afterNode.label} properties={step.afterNode.properties}/></div>}
            </>}
        </details>)}<div className="sf-actions">
        <button className="sf-primary" disabled={s.busy} onClick={() => void c.commit()}>我已核对，确认保存入库</button>
        <button disabled={s.busy} onClick={() => c.set({ preview: undefined })}>取消批准</button>
        <button disabled={s.busy} onClick={() => void c.reconcile()}>回读保存结果</button>
        </div></div>}
    {s.receipt && <div role="status">
        <strong>保存结果：{({ succeeded: '成功', failed: '未完成', partial: '部分成功', unknown: '结果待核对', stale: '数据已变化，请重新核对', executing: '执行中' })[s.receipt.state]}</strong>
        <p>{s.receipt.error?.message}</p><ol>{s.receipt.results.map(result => <li key={result.index}>{operations[s.receipt!.steps[result.index]!.operation]}：{({ verified: '已回读确认', attempting: '已发出，待确认', unknown: '结果待核对' })[result.state]}{result.error && ' · ' + result.error.message}</li>)}</ol>
        {s.receipt.state !== 'succeeded' && <button disabled={s.busy} onClick={() => void c.reconcile()}>只读回查原请求</button>}<p>未完成时保留草稿与回执；不会自动补偿、删除或重放。</p>
    </div>}
    </div>;
}
