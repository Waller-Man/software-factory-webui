import type { Controller, State } from './controller.ts';
export function DraftPicker({ controller: c, state: s }: {
    controller: Controller;
    state: State;
}) {
    return <details className="sf-drafts">
    <summary>{s.editing && s.draft ? `${s.draft.title} · r${s.draft.revision}` : '恢复草稿'}</summary>
    <div className="sf-draft-list">
    {!s.drafts.length && <p>暂无草稿</p>}{s.drafts.map(d => <div className="sf-draft-row" key={d.id}>
        <button disabled={s.busy} onClick={() => void c.openDraft(d.id)}>
        <strong>{d.title}</strong>
        <small>{d.mode} · {d.changeCount} 项 · {new Date(d.updatedAt).toLocaleString()}</small>
        </button>
        <button disabled={s.busy || ['attention', 'committing'].includes(d.state)} aria-label={`删除草稿 ${d.title}`} title="仅删除草稿" onClick={() => { if (window.confirm(`删除“${d.title}”草稿？不会删除数据库节点。`))
            void c.removeDraft(d.id); }}>×</button>
        </div>)}
  </div>
    </details>;
}
