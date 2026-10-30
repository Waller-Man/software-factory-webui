import { useEffect, useRef, useState } from 'react';
import { fieldIdentity, type Field } from './fields.ts';
import { FieldValue } from '../../shared/FieldDisplay.tsx';
export function FieldEditor({ field, value, revision, locked, busy, save }: {
    field: Field;
    value?: string;
    revision: number;
    locked: boolean;
    busy: boolean;
    save: (value: string, clear: boolean, revision: number) => Promise<unknown>;
}) {
    const [text, setText] = useState(value ?? ''), [mode, setMode] = useState<'keep' | 'set' | 'unset'>('keep'), [dirty, setDirty] = useState(false), [saving, setSaving] = useState(false);
    useEffect(() => { if (!dirty) {
        setText(value ?? '');
        setMode('keep');
    } }, [value, dirty]);
    const baseRevision = useRef(revision);
    function begin() { if (!dirty)
        baseRevision.current = revision; }
    useEffect(() => { if (!dirty)
        return; const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; }; window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn); }, [dirty]);
    async function apply(explicit = false) { if (!dirty || mode === 'keep' || locked)
        return; setSaving(true); try {
        const result = await save(text, mode === 'unset', explicit ? revision : baseRevision.current);
        if (result)
            setDirty(false);
    }
    finally {
        setSaving(false);
    } }
    return <div className="sf-field">
    <div className="sf-field-heading">
    <label htmlFor={`sf-field-${fieldIdentity(field)}`}>{field.title}{field.required && <span aria-label="提交时必填"> *</span>}</label>
    </div>{field.hint && <p>{field.hint}</p>}{locked ? <>
        <div className="sf-readonly"><FieldValue field={field.key} kind={field.object} value={value}/></div>
        <small>已有Agent ID不可修改；名称和逻辑能力描述请从概览的逻辑Agent修改入口编辑。</small>
        </> : <>
        <div className="sf-actions">
        <select aria-label={`${field.title}修改方式`} value={mode} disabled={busy || saving} onChange={e => { begin(); setMode(e.target.value as typeof mode); setDirty(e.target.value !== 'keep'); if (e.target.value === 'keep')
            setText(value ?? ''); }}>
        <option value="keep">保持原值{value === undefined ? '（省略）' : ''}</option>
        <option value="set">填写新值</option>{!field.required && <option value="unset">清空可选属性</option>}</select>{dirty && <button disabled={busy || saving} onClick={() => void apply(true)}>暂存字段</button>}<small>{saving ? '暂存中…' : dirty ? '尚有本地修改，离开字段时暂存' : '已与草稿同步'}</small>
        </div>{dirty && revision !== baseRevision.current && <p role="status">草稿已变化，本地输入仍保留。核对后点击暂存字段再应用，不会自动覆盖。</p>}{mode !== 'unset' && <textarea id={`sf-field-${fieldIdentity(field)}`} rows={field.json || field.key === 'description' ? 4 : 2} value={text} disabled={busy || saving} placeholder={field.required ? '提交入库时必填，草稿可暂缺' : '未知可选值留空并保持省略'} onChange={e => { begin(); setText(e.target.value); setMode('set'); setDirty(true); }} onBlur={() => { if (revision === baseRevision.current)
            void apply(); }}/>}{mode === 'unset' && <p>保存该操作后将移除此可选属性，不会填入空字符串。请点击“暂存字段”。</p>}</>}</div>;
}
