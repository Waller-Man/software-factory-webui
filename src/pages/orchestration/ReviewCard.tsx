import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { PropsRenderFactories } from '@deepseek-ai/dsh-client-ui-slots';
import type { ReviewPlan, Selection } from '../../../../orchestration/src/types.ts';
import type { SelectionClient } from './api.ts';
const labels: Record<string, string> = { software_intro: '需求描述', text: '输入正文', path: '输入文档', title: '文档标题', mode: '处理方式' };
function Reasons({ title, values }: { title: string; values?: string[] }) {
  return values?.length ? <details open={title === '推荐依据'}><summary>{title}</summary><ul>{values.map((v, i) => <li key={i}>{v}</li>)}</ul></details> : null;
}
export function ReviewCard({ selectionId, client, renderFactorySlot }: { selectionId: string; client: SelectionClient } & PropsRenderFactories) {
  const remote = useSyncExternalStore(client.subscribe, client.getSnapshot);
  const [row, setRow] = useState<Selection>(), [chosen, setChosen] = useState(''), [plan, setPlan] = useState<ReviewPlan>();
  const [error, setError] = useState(''), [busy, setBusy] = useState(false), [modelReady, setModelReady] = useState(false), [manual, setManual] = useState(false);
  const lock = useRef(false), epoch = useRef(0);
  const onModelReady = useCallback((ready: boolean) => setModelReady(ready), []);
  useEffect(() => {
    let active = true;
    if (!remote) { setError('Agent 编排后端未就绪'); return; }
    void client.get(selectionId).then(r => { if (!active) return; const preferred = r.selectedVersionId ?? r.manualVersionId ?? r.recommendation?.versionId ?? ''; setRow(r); setChosen(r.candidates.some(c => c.version.vertexId === preferred) ? preferred : ''); setError(''); }).catch(e => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [client, remote, selectionId]);
  useEffect(() => {
    const current = ++epoch.current; setPlan(undefined); setModelReady(false);
    if (!row || row.status !== 'review' || !chosen) return;
    setBusy(true);
    void client.prepare({ selectionId, revision: row.revision, versionId: chosen, ...(manual ? { assist: true } : {}) }).then(p => {
      if (epoch.current !== current) return; setPlan(p); setError('');
    }).catch(e => { if (epoch.current === current) setError(e.message); }).finally(() => { if (epoch.current === current) setBusy(false); });
  }, [client, selectionId, row?.revision, row?.status, chosen, manual]);
  async function confirm() {
    if (!row || !plan || lock.current || plan.issues.length || !modelReady) return;
    lock.current = true; setBusy(true); setError('');
    try {
      const current = await client.prepare({ selectionId, revision: row.revision, versionId: chosen });
      if (current.issues.length) { setPlan(current); return; }
      const run = await client.confirm({ selectionId, revision: current.revision, digest: current.digest });
      setRow({ ...row, ...run, selectedVersionId: chosen, executionModelName: current.modelName, status: 'started' });
    } catch (e) { setError((e as Error).message); }
    finally { lock.current = false; setBusy(false); }
  }
  const selected = row?.candidates.find(c => c.version.vertexId === chosen);
  const ready = !!plan && !plan.issues.length && !manual;
  return <section className="sf-selection-card" aria-label="Agent 选择审核">
    <header><strong>Agent 选择审核</strong><span>{row?.status === 'started' ? '已确认执行' : ready ? '参数已确定，等待确认' : '整理选择与参数'}</span></header>
    {error && <p role="alert" className="sf-selection-error">{error}</p>}
    {!row ? <p>正在读取选择记录…</p> : <>
      <p>{row.recommendation?.summary}</p>
      <Reasons title="推荐依据" values={row.recommendation?.reasons}/><Reasons title="字段证据" values={row.recommendation?.evidence}/><Reasons title="备选比较" values={row.recommendation?.alternatives}/>
      <small>已加载 {row.candidates.length} 个当前可执行版本 · {row.complete ? '本次查询完整' : '查询范围有限'} · 非事务快照</small>
      <Reasons title="读取提示" values={row.warnings}/>
      {row.status === 'review' && <div className="sf-selection-choice">
        {row.candidates.length ? <label>最终Agent<select aria-label="最终Agent" disabled={busy || manual} value={chosen} onChange={e => { setPlan(undefined); setManual(true); setChosen(e.target.value); }}><option value="" disabled>请选择可执行Agent</option>{row.candidates.map(c => <option key={c.version.vertexId} value={c.version.vertexId}>{String(c.agent.properties.name ?? c.agent.properties.agent_id)} · {String(c.version.properties.version)}</option>)}</select></label> : <p role="status">当前没有可执行Agent，请查看入口未就绪的原因。</p>}
        {selected && <p className="sf-selection-agent"><b>{String(selected.agent.properties.name)}</b> · {String(selected.version.properties.version)}</p>}
        {busy && <p role="status">正在核对真实入口与参数…</p>}
        {plan?.parameterReport?.length ? <div className="sf-selection-report"><b>本次执行参数</b><dl>{plan.parameterReport.map(p => <div key={p.name}><dt>{labels[p.name] ?? p.name}</dt><dd>{typeof p.value === 'string' ? p.value : JSON.stringify(p.value)}<small>{p.basis}</small></dd></div>)}</dl></div> : null}
        <Reasons title="参数依据" values={row.recommendation?.parameterNotes}/>
        {!ready && plan && <div className="sf-selection-missing" role="status"><b>参数尚未确定</b><ul>{plan.issues.map((issue, i) => <li key={i}>{issue}</li>)}</ul><p>请在聊天中补充以上信息，助手会整理参数并更新选择报告。</p></div>}
        {ready && <div className="sf-selection-execution" aria-label="执行审核"><label>执行模型</label>{renderFactorySlot('softwareFactory.executionModel', { runtimeSessionId: plan!.runtimeSessionId, locked: busy, onReady: onModelReady }, { fallback: <p role="status">DSH 会话或模型服务未就绪，请启用后重试。</p> })}<footer><button className="sf-selection-primary" disabled={busy || !modelReady} onClick={() => void confirm()}>{busy ? '正在提交…' : '确认并执行'}</button></footer></div>}
      </div>}
      <Reasons title="待核实事项" values={row.recommendation?.unresolved}/>
      {row.status === 'uncertain' && <p role="alert">本次启动未取得可靠回执，请核对已有任务；不会自动重试。</p>}
      {row.runId && row.runtimeSessionId && <div className="sf-selection-run">{renderFactorySlot('softwareFactory.runCard', { runId: row.runId, runtimeSessionId: row.runtimeSessionId, modelName: row.executionModelName, title: selected ? String(selected.agent.properties.name) : '业务执行' })}</div>}
    </>}
  </section>;
}
