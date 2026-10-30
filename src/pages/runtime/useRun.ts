import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { Artifact, RunRecord, RunStatus } from '../../../../contracts/src/runtime.ts';
import type { RunCardProps, RunCardFinished } from '../../runtime.ts';
import { RuntimeClient, unwrap } from './api.ts';

export const terminal = (status: RunStatus): status is RunCardFinished['status'] => ['completed', 'failed', 'cancelled', 'interrupted'].includes(status);
export function filesOf(run: RunRecord): Artifact[] {
    // The business result owns the delivery list; the artifact index also
    // contains files bundled inside those deliveries and must not expand it.
    return run.result?.files ?? [];
}
export function useRun(client: RuntimeClient, props: RunCardProps) {
    const remote = useSyncExternalStore(client.subscribe, client.getSnapshot);
    const key = `${props.runtimeSessionId}/${props.runId}`;
    const [state, setState] = useState<{ key: string; run?: RunRecord; error?: string }>({ key });
    const [retry, setRetry] = useState(0);
    const delivered = useRef('');
    const callback = useRef(props.onFinished);
    callback.current = props.onFinished;
    useEffect(() => {
        const abort = new AbortController();
        setState({ key });
        if (!remote) return () => abort.abort();
        const accept = (run: RunRecord) => {
            if (abort.signal.aborted) return;
            setState({ key, run });
            if (terminal(run.status) && delivered.current !== key && callback.current) {
                delivered.current = key;
                const issue = run.issues.findLast(i => i.level === 'error');
                // A consumer callback must not interrupt the card's own subscription.
                try { callback.current({ runId: run.runId, status: run.status, text: run.result?.text,
                    files: filesOf(run).map(({ artifactId, name, mime, size }) => ({ artifactId, name, mime, size })),
                    error: issue ? { stage: issue.stage, message: issue.message } : undefined }); }
                catch (error) { console.error('Run card onFinished callback failed', error); }
            }
        };
        void (async () => {
            let run = await unwrap(remote.getRun(props.runtimeSessionId, { runId: props.runId }, abort.signal));
            accept(run);
            while (!abort.signal.aborted && !terminal(run.status)) {
                const update = await unwrap(remote.waitRun(props.runtimeSessionId, { runId: props.runId, afterSeq: run.lastSeq, waitMs: 15000 }, abort.signal));
                if (abort.signal.aborted) return;
                if (update.lastSeq !== run.lastSeq || terminal(update.run.status)) {
                    run = await unwrap(remote.getRun(props.runtimeSessionId, { runId: props.runId }, abort.signal));
                    accept(run);
                }
            }
        })().catch(error => { if (!abort.signal.aborted) setState(old => ({ ...old, key, error: error instanceof Error ? error.message : String(error) })); });
        return () => abort.abort();
    }, [key, props.runtimeSessionId, props.runId, remote, retry]);
    return { ...(state.key === key ? state : {}), remote, retry: () => setRetry(n => n + 1) };
}
