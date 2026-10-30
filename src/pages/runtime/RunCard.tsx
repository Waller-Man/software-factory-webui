import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { Artifact } from '../../../../contracts/src/runtime.ts';
import type { RunCardProps } from '../../runtime.ts';
import { RuntimeClient, downloadHref, unwrap } from './api.ts';
import { filesOf, terminal, useRun } from './useRun.ts';
import type { Translate } from './i18n.ts';

type CardRuntime = { client: RuntimeClient; t: Translate; modelNameFor?: (provider: string, model: string) => Promise<string | undefined> };
export function RunCard(props: RunCardProps & CardRuntime) {
    // A new session/run remounts all local button state and cancels old requests.
    return <RunCardBody key={`${props.runtimeSessionId}/${props.runId}`} {...props} />;
}
function RunCardBody(props: RunCardProps & CardRuntime) {
    const { t, runId, runtimeSessionId } = props;
    const { run, error, remote, retry } = useRun(props.client, props);
    const session = useSyncExternalStore(props.client.subscribe, props.client.getSessionSnapshot);
    const [actionError, setActionError] = useState('');
    const [busy, setBusy] = useState('');
    const [modelCaption, setModelCaption] = useState(props.modelName);
    useEffect(() => {
        let active = true; setModelCaption(props.modelName);
        if (!props.modelName && run?.model && props.modelNameFor) void props.modelNameFor(run.model.provider, run.model.model).then(name => { if (active) setModelCaption(name); }).catch(() => {});
        return () => { active = false; };
    }, [props.modelName, props.modelNameFor, run?.model?.provider, run?.model?.model]);
    const action = useRef<AbortController | undefined>(undefined);
    useEffect(() => { setBusy(''); return () => action.current?.abort(); }, [remote]);
    const perform = async (name: string, work: (signal: AbortSignal) => Promise<void>) => {
        action.current?.abort();
        const controller = new AbortController(); action.current = controller;
        setBusy(name); setActionError('');
        try { await work(controller.signal); }
        catch (error) { if (!controller.signal.aborted) setActionError(error instanceof Error ? error.message : String(error)); }
        finally { if (!controller.signal.aborted) setBusy(''); }
    };
    const download = (file: Artifact) => {
        if (!remote) return;
        void perform(file.artifactId, async signal => {
            const current = await unwrap(remote.getArtifact(runtimeSessionId, { runId, artifactId: file.artifactId }, signal));
            if (signal.aborted) return;
            const link = document.createElement('a');
            link.href = downloadHref(current.downloadUrl, runtimeSessionId, runId, file.artifactId, window.location.href);
            link.download = current.name; link.rel = 'noopener';
            document.body.append(link); link.click(); link.remove();
        });
    };
    const progress = run?.progress;
    const percent = typeof progress === 'number' && Number.isFinite(progress) ? Math.max(0, Math.min(100, progress)) : undefined;
    const issue = run?.issues.findLast(i => i.level === 'error');
    const warning = run?.issues.findLast(i => i.level === 'warning');
    const files = run ? filesOf(run) : [];
    const openDirectory = (path: string) => {
        if (!session) return;
        void perform('directory', async signal => {
            const result = await session.openWorkspacePath({ path }, signal);
            if (!result.ok) throw new Error(result.error.message);
        });
    };
    const cancel = () => {
        if (!remote) return;
        void perform('cancel', async signal => { await unwrap(remote.cancelRun(runtimeSessionId, { runId }, signal)); if (!signal.aborted) retry(); });
    };
    return <section className="sf-run-card" data-status={run?.status} aria-label={props.title ?? t('execution')}>
        <header><strong>{props.title ?? run?.toolId ?? t('execution')}</strong><span className="sf-run-status" role="status">{run ? t(run.status) : !remote ? t('unavailable') : t('loading')}</span></header>
        <p className="sf-run-model"><span>{t('model')}</span> {run?.model ? <>{modelCaption ?? run.model.model}<small>{run.model.provider}</small></> : t('noModel')}</p>
        <div className="sf-run-stage"><span>{run?.stageName ?? run?.stage ?? (run?.status === 'queued' ? t('queued') : t('noStage'))}</span><b>{percent === undefined ? '—' : `${percent}%`}</b></div>
        <div className="sf-run-track" role="progressbar" aria-label={t('progress')} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} aria-valuetext={percent === undefined ? t('noProgress') : undefined}><div style={{ width: `${percent ?? 0}%` }} /></div>
        {run?.message && <p className="sf-run-message">{run.message}</p>}
        {issue && <p className="sf-run-error" role="alert">{issue.stage && <b>{issue.stage} · </b>}{issue.message}</p>}
        {warning && <p className="sf-run-warning">{t('warning')}{warning.stage ? ` · ${warning.stage}` : ''}：{warning.message}</p>}
        {run?.status === 'failed' && !issue && <p className="sf-run-error" role="alert">{run.message ?? t('failed')}</p>}
        {run?.result?.text && <div className="sf-run-result">{run.result.text}</div>}
        {files.length > 0 && <div className="sf-run-files" aria-label={t('finalArtifacts')}><b>{t('finalArtifacts')}</b>{files.map(file => <button type="button" key={file.artifactId} disabled={!remote || !!busy} onClick={() => download(file)} title={file.name}><span aria-hidden="true">↓ </span>{t('download')} {file.name}</button>)}</div>}
        {!!run?.intermediateDirectories?.length && <div className="sf-run-directories" aria-label={t('intermediate')}><b>{t('intermediate')}</b>{run.intermediateDirectories.map(directory => <div key={directory.path}><button type="button" disabled={!session || !!busy} onClick={() => openDirectory(directory.path)}>{t('openDirectory')} · {directory.fileCount} {t('fileCount')}</button><small>{directory.path}</small></div>)}</div>}
        {run && (run.logs.length > 0 || run.issues.length > 1) && <details className="sf-run-details"><summary>{t('details')}</summary>{run.logs.map((log, i) => <p key={`l${i}`}>{log.stage && <b>{log.stage} · </b>}{log.message}</p>)}{run.issues.map((item, i) => <p key={`i${i}`}>{t(item.level)}{item.stage && ` · ${item.stage}`}：{item.message}</p>)}</details>}
        {(error || actionError) && <p className="sf-run-error" role="alert">{error || actionError}</p>}
        {!remote && <p className="sf-run-message">{t('enableRuntime')}</p>}
        <footer>{error && remote && <button type="button" onClick={retry}>{t('retry')}</button>}{run && !terminal(run.status) && <button type="button" disabled={!remote || !!busy || run.status === 'cancelling'} onClick={cancel}>{run.status === 'cancelling' || busy === 'cancel' ? t('cancelling') : t('cancel')}</button>}</footer>
    </section>;
}
