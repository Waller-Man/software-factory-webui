import { useEffect, useRef, useState } from 'react';
import type { ModelCallSummary, ModelCallRecord } from '../../../../contracts/src/runtime.ts';
import { unwrap, type RuntimeRemote } from './api.ts';
import type { Translate } from './i18n.ts';

/** Details are loaded through the authenticated Remote only when expanded. */
function Call({ call, remote, session, runId, t }: { call: ModelCallSummary; remote?: RuntimeRemote; session: string; runId: string; t: Translate }) {
    const [record, setRecord] = useState<ModelCallRecord>();
    const [error, setError] = useState('');
    const controller = useRef<AbortController | undefined>(undefined);
    useEffect(() => () => controller.current?.abort(), [remote]);
    const load = async () => {
        if (!remote?.getModelCall) { setError(t('recordUnavailable')); return; }
        controller.current?.abort();
        const action = new AbortController(); controller.current = action;
        setError('');
        try {
            const result = await unwrap(remote.getModelCall(session, { runId, requestId: call.requestId }, action.signal));
            if (!action.signal.aborted) setRecord(result);
        } catch (reason) { if (!action.signal.aborted) setError(reason instanceof Error ? reason.message : String(reason)); }
    };
    return <details className="sf-run-model-call" onToggle={event => { if (event.currentTarget.open) void load(); else controller.current?.abort(); }}>
        <summary>{call.stage ? `${call.stage} · ` : ''}{call.protocol} · {t(call.status)}{call.durationMs !== undefined && ` · ${call.durationMs} ms`}</summary>
        <small>{call.requestId} · {call.model.provider} / {call.model.model}{call.model.reasoningEffort && ` · ${call.model.reasoningEffort}`}</small>
        {call.error && <p className="sf-run-error">{call.error.message}</p>}
        {record ? <pre>{JSON.stringify(record, null, 2)}</pre> : !error && <p>{t('loading')}</p>}
        {error && <p className="sf-run-error" role="alert">{error} <button type="button" onClick={() => void load()}>{t('retry')}</button></p>}
    </details>;
}
export function ModelCalls({ calls, ...props }: { calls?: ModelCallSummary[]; remote?: RuntimeRemote; session: string; runId: string; t: Translate }) {
    return calls?.length ? <details className="sf-run-details"><summary>{props.t('modelCalls')} · {calls.length}</summary>{calls.map(call => <Call key={`${call.requestId}/${call.status}`} call={call} {...props} />)}</details> : null;
}
