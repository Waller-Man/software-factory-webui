import { useEffect, useRef, useState } from 'react';
import type { InteractionAnswerInput, InteractionRecord } from '../../../../contracts/src/runtime.ts';
import type { Translate } from './i18n.ts';
import type { RuntimeClient } from './api.ts';

export function Interaction({ item, client, source, runId, t, onAnswered }: { item: InteractionRecord; client: RuntimeClient; source: string; runId: string; t: Translate; onAnswered: () => void }) {
    const [value, setValue] = useState(''), [text, setText] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('');
    const controller = useRef<AbortController | undefined>(undefined);
    useEffect(() => () => controller.current?.abort(), []);
    const request = item.request;
    const valid = request.type === 'select' ? !!value : request.type === 'text' ? !!text.trim() : !!value || !!text.trim();
    async function submit(event: React.FormEvent) {
        event.preventDefault();
        if (!valid || busy) return;
        const answer: InteractionAnswerInput = request.type === 'select' ? { type: 'select', value }
            : request.type === 'text' ? { type: 'text', text: text.trim() }
            : { type: 'mixed', ...(value ? { value } : {}), ...(text.trim() ? { text: text.trim() } : {}) };
        const abort = new AbortController(); controller.current = abort;
        setBusy(true); setError('');
        try { await client.answer(source, { runId, interactionId: item.interactionId, answer }, abort.signal); if (!abort.signal.aborted) onAnswered(); }
        catch (error) { if (!abort.signal.aborted) setError(error instanceof Error ? error.message : String(error)); }
        finally { if (!abort.signal.aborted) setBusy(false); }
    }
    return <form className="sf-run-interaction" onSubmit={submit}>
        <fieldset disabled={busy}><legend>{request.question}</legend>
            {request.detail && <p className="sf-run-question-detail">{request.detail}</p>}
            {'options' in request && request.options.map(option => <label className="sf-run-option" key={option.value}>
                <input type="radio" name={`question-${item.interactionId}`} value={option.value} checked={value === option.value} onChange={() => setValue(option.value)} />
                <span>{option.label}{option.description && <small>{option.description}</small>}</span>
            </label>)}
            {request.type === 'mixed' && value && <button type="button" onClick={() => setValue('')}>{t('clearChoice')}</button>}
            {request.type !== 'select' && <label className="sf-run-answer-text">{t('answerText')}
                <textarea value={text} maxLength={16384} rows={3} placeholder={request.placeholder} onChange={event => setText(event.target.value)} />
            </label>}
            <button type="submit" disabled={!valid || busy}>{t(busy ? 'sendingAnswer' : 'submitAnswer')}</button>
            {error && <p className="sf-run-error" role="alert">{error}</p>}
        </fieldset>
    </form>;
}

export function InteractionHistory({ items, t }: { items: InteractionRecord[]; t: Translate }) {
    const settled = items.filter(item => item.status !== 'pending');
    if (!settled.length) return null;
    return <details className="sf-run-details"><summary>{t('interactionHistory')}</summary>{settled.map(item => {
        const answer = item.answer;
        const selected = answer && 'value' in answer && 'options' in item.request ? item.request.options.find(option => option.value === answer.value)?.label : undefined;
        return <div key={item.interactionId}><b>{item.request.question}</b><p>{t(item.status === 'answered' ? 'answered' : item.status === 'expired' ? 'answerExpired' : 'answerCancelled')}
            {selected && ` · ${selected}`}{answer && 'text' in answer && answer.text && ` · ${answer.text}`}</p></div>;
    })}</details>;
}
