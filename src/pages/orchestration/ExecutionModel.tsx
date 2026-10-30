import { useEffect, useState, useSyncExternalStore } from 'react';
import type { Context } from '@deepseek-ai/cordis';
import type { ISessions, SessionReference } from '@deepseek-ai/dsh-api-session-controller/client';
import type { SessionId } from '@deepseek-ai/dsh-session/types';
import type { ModelDirectory } from '@deepseek-ai/dsh-client-ui-model-selection/client';
import type { ModelSelection } from '@deepseek-ai/dsh-api-session-controller/types';

export function ExecutionModel({ ctx, runtimeSessionId, locked, onReady }: { ctx: Context; runtimeSessionId: string; locked: boolean; onReady: (ready: boolean) => void }) {
  const [reference, setReference] = useState<SessionReference>(), [directory, setDirectory] = useState<ModelDirectory>(), [error, setError] = useState('');
  useEffect(() => {
    let active = true; const controller = new AbortController(); onReady(false); setReference(undefined); setDirectory(undefined); setError('');
    const sessions = ctx.get('sessions') as ISessions | undefined, models = ctx.get('modelDirectories');
    if (!sessions || !models) { setError('请启用DSH原生模型选择组件'); return; }
    const ref = sessions.retain(runtimeSessionId as SessionId, { source: 'softwareFactory', signal: controller.signal });
    void ref.ready.then(async () => {
      if (!active) return; setReference(ref);
      const modelDirectory = models.directoryFor(runtimeSessionId as SessionId); setDirectory(modelDirectory);
      await modelDirectory.load();
    }).catch(e => { if (active) setError(e.message); });
    return () => { active = false; controller.abort(); ref.release(); onReady(false); };
  }, [ctx, runtimeSessionId, onReady]);
  return <div className="sf-selection-model">{error ? <p role="alert">{error}</p> : reference && directory ? <ModelChoice directory={directory} onReady={onReady} locked={locked}/> : <span>正在加载原生模型列表…</span>}</div>;
}
// The native composer owns conversation.input.model. Reuse its directory and
// selection operation here, without redeclaring or importing that private view.
function ModelChoice({ directory, onReady, locked }: { directory: ModelDirectory; onReady: (ready: boolean) => void; locked: boolean }) {
  const state = useSyncExternalStore(directory.store.subscribe, directory.store.getSnapshot);
  const [error, setError] = useState('');
  const choices = state.groups.flatMap(group => group.models.map(model => ({ group, model })));
  const current = choices.findIndex(choice => choice.group.id === state.current?.provider && choice.model.id === state.current.model);
  const reasoning = choices[current]?.model.reasoning;
  const disabled = locked || !!state.pending || state.status === 'loading';
  const select = async (selection: ModelSelection) => {
    onReady(false); setError('');
    try { const result = await directory.select(selection); if (!result.ok) setError(result.error.message); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  };
  useEffect(() => { onReady(!!state.current && state.routable === true && !state.pending); }, [state, onReady]);
  return <>
    <label>执行模型<select aria-label="执行模型" value={current < 0 ? '' : String(current)} disabled={disabled} onChange={event => {
      const choice = choices[Number(event.target.value)]; if (!choice) return;
      const same = choice.group.id === state.current?.provider && choice.model.id === state.current.model;
      const reasoningEffort = same ? state.current?.reasoningEffort ?? choice.model.reasoning?.defaultEffort : choice.model.reasoning?.defaultEffort;
      void select({ provider: choice.group.id, model: choice.model.id, ...(reasoningEffort === undefined ? {} : { reasoningEffort }) });
    }}>
      {current < 0 && <option value="" disabled>{state.current ? '当前模型不可用，请重新选择' : '请选择执行模型'}</option>}
      {state.groups.map(group => <optgroup key={group.id} label={group.name}>{group.models.map(model => <option key={model.id} value={String(choices.findIndex(choice => choice.group.id === group.id && choice.model.id === model.id))}>{model.name}</option>)}</optgroup>)}
    </select></label>
    {reasoning && <label>推理强度<select aria-label="推理强度" disabled={disabled} value={state.current?.reasoningEffort ?? reasoning.defaultEffort ?? ''} onChange={event => {
      if (!state.current) return;
      void select({ provider: state.current.provider, model: state.current.model, ...(event.target.value ? { reasoningEffort: event.target.value } : {}) });
    }}>
      {reasoning.defaultEffort === undefined && <option value="">模型默认</option>}
      {reasoning.efforts.map(effort => <option key={effort.id} value={effort.id}>{effort.name}</option>)}
    </select></label>}
    {(error || state.error) && <p role="alert">{error || state.error}</p>}
    {state.failures.map(failure => <small key={failure.id}>{failure.name}：{failure.message}</small>)}
  </>;
}
