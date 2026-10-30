import { useEffect, useSyncExternalStore } from 'react';
import type { Context } from '@deepseek-ai/cordis';
import type { Controller } from './shared/controller.ts';
import { AssistantPanel, type NativeHost } from './shared/native.tsx';
import { OverviewPage } from './pages/overview/Page.tsx';
import { ManagePage } from './pages/manage/Page.tsx';
import { SplitLayout } from './shared/SplitLayout.tsx';
export function App({ controller: c, ctx, page, ...native }: {
    controller: Controller;
    ctx: Context;
    page: 'overview' | 'manage';
} & NativeHost) {
    const state = useSyncExternalStore(c.subscribe, c.getSnapshot);
    useEffect(() => { if (!c.getSnapshot().graph)
        void c.load().then(() => c.resume()); c.set({ page }); }, [c, page]);
    useEffect(() => { const id = window.setInterval(() => void c.poll(), 2000); return () => window.clearInterval(id); }, [c]);
    return <div className="sf-app">
    <SplitLayout className="sf-workspace" storageKey={`${page}:${state.editing ? 'edit' : 'read'}`} stackAt={900} panes={[
      { id: 'main', label: page === 'overview' ? '概览' : '入库表单', initial: 60, min: 520, children: <div className="sf-page">{state.error && <div className="sf-error" role="alert">{state.error}<button onClick={() => c.set({ error: undefined })}>×</button>
        </div>}{state.notice && <div className="sf-notice" role="status">{state.notice}<button onClick={() => c.set({ notice: undefined })}>×</button>
        </div>}{page === 'overview' ? <OverviewPage controller={c} state={state}/> : <ManagePage controller={c} state={state}/>}</div> },
      ...(state.editing ? [{ id: 'assistant', label: 'AI 草稿助手', initial: 40, min: 300, collapsible: true, children: <aside className="sf-assistant">
        <div className="sf-assistant-heading">
        <small>仅辅助草稿 · 人工保存入库</small>
        </div>{state.assistant ? <>
            <small className="sf-workspace-path" title={state.assistant.workspace}>工作区：{state.assistant.workspace}</small>
            <AssistantPanel {...native} ctx={ctx} sessionId={state.assistant.sessionId}/>
            </> : <div className="sf-assistant-empty">
            <p>{state.assistantError ?? '正在准备独立会话…'}</p>{state.assistantError && <button onClick={() => void c.assist()}>重新连接 AI</button>}<p>可以继续手工编辑。AI的修改会同步到当前草稿。</p>
            </div>}</aside> }] : [])
    ]}/>
    </div>;
}
