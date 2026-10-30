import { useEffect, useState, useSyncExternalStore } from 'react';
import type { Context } from '@deepseek-ai/cordis';
import type { ISessions, SessionReference } from '@deepseek-ai/dsh-api-session-controller/client';
import type { SessionId } from '@deepseek-ai/dsh-session/types';
import type { PropsRenderFactories, PropsRenderSlots, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
import type { SelectionClient } from './api.ts';
import { NativeConversationViews } from '../../shared/native.tsx';
const rememberedKey = 'softwareFactory.orchestration.session';
export function SelectionConversation({ renderFactorySlot }: PropsRuntime<'softwareFactory.orchestrationConversation'> & PropsRenderFactories) {
  // Reuse the real native transcript/composer, including attachments and model selection.
  // The dedicated page owns its fixed mode/workspace header; the composer stays native.
  // Standalone content uses the native embedded layout; main expects ConversationRoot.
  // Keep a growing transcript seat even while blank so the upward menu has room.
  return <div className="sf-selection-native">{renderFactorySlot('conversation.content', { variant: 'embedded', phase: 'active', hero: false }, { slots: { views: NativeConversationViews } })}</div>;
}
export function SelectionPage({ client, ctx, SessionProvider, renderSlot, useWorkspaces }: { client: SelectionClient; ctx: Context; useWorkspaces: PropsRuntime<'softwareFactory.orchestrationConversation'>['useWorkspaces'] } & PropsRenderSlots<'softwareFactory.orchestrationConversation'>) {
  const remote = useSyncExternalStore(client.subscribe, client.getSnapshot);
  const workspaces = useWorkspaces(s => s.items);
  const [workspaceId, setWorkspaceId] = useState(''), [currentPath, setCurrentPath] = useState('');
  const [ref, setRef] = useState<SessionReference>(), [error, setError] = useState(''), [generation, setGeneration] = useState(0);
  useEffect(() => {
    let active = true, retained: SessionReference | undefined;
    setRef(undefined);
    const abort = new AbortController();
    const sessions = ctx.get('sessions') as ISessions | undefined;
    if (!remote || !sessions) { setError('请启用 Agent 编排后端与 DSH 原生会话界面'); return; }
    let saved: string | undefined; try { saved = localStorage.getItem(rememberedKey) ?? undefined; } catch {}
    const main = Object.values(sessions.list.getSnapshot().byId).find(s => (s.retainedBy.mainView ?? 0) > 0);
    void client.session(saved ? { sessionId: saved } : { ...(main ? { sourceSessionId: main.id } : {}), ...(workspaceId ? { workspaceId } : {}) }).then(async binding => {
      if (!active) return;
      setCurrentPath(binding.workspace);
      try { localStorage.setItem(rememberedKey, binding.sessionId); } catch {}
      retained = sessions.retain(binding.sessionId as SessionId, { source: 'softwareFactory', signal: abort.signal });
      await retained.ready; if (active) { setRef(retained); setError(''); }
    }).catch(e => { if (active) setError(e.message); });
    return () => { active = false; abort.abort(); retained?.release(); };
  }, [ctx, client, remote, generation, workspaceId]);
  function newSession() { try { localStorage.removeItem(rememberedKey); } catch {} setGeneration(x => x + 1); }
  const activeWorkspace = workspaces.find(w => w.path === currentPath);
  return <div className="sf-selection-page"><header><strong>Agent 编排</strong><span>固定模式 · 单版本选择</span><select aria-label="编排工作区" title="切换工作区会新建编排会话" value={activeWorkspace?.workspaceId ?? workspaceId} onChange={e => { try { localStorage.removeItem(rememberedKey); } catch {} setWorkspaceId(e.target.value); }}><option value="">当前工作区</option>{workspaces.map(w => <option key={w.workspaceId} value={w.workspaceId}>{w.title || w.path}</option>)}</select><button onClick={newSession}>新建编排会话</button></header>
    {error ? <p role="alert">{error}<button onClick={() => setGeneration(x => x + 1)}>重新连接</button></p> :
      ref ? <div className="sf-selection-session"><SessionProvider session={ref}>{renderSlot('softwareFactory.orchestrationConversation', {})}</SessionProvider></div> : <p>正在打开原生聊天…</p>}
  </div>;
}

