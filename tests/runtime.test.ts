/** Native Gateway codecs and built React card; transport data are synthetic. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { runInNewContext } from 'node:vm';
import { setTimeout as delay } from 'node:timers/promises';
import { Context } from '@deepseek-ai/cordis';
import TypertRegistry from '@deepseek-ai/dsh-typert-registry';
import * as ClientGateway from '@deepseek-ai/dsh-api-gateway/src/client/index.ts';
import { reduceRunHistory, RUN_TOOL, runDefinition } from '../src/pages/runtime/history.ts';
import { downloadHref } from '../src/pages/runtime/api.ts';
import type { RunRecord } from '../../contracts/src/runtime.ts';

const host = resolve(process.env.DSH_SOURCE ?? '../DSH-Softwarefactory');
const hostRequire = createRequire(join(host, 'package.json'));
const uiRequire = createRequire(join(host, 'packages/client/ui-primitives/package.json'));
const id = 'a1111111-1111-4111-8111-111111111111';
const id2 = 'b2222222-2222-4222-8222-222222222222';
const call = (callId = 'call-1', name = RUN_TOOL) => ({ type: 'tool/call', data: { turn: 1, step: 1, callId, name, arguments: '{"toolId":"report_tool"}' } }) as any;
const result = (callId = 'call-1', runId = id) => ({ type: 'tool/result', data: { turn: 1, step: 1, message: { toolCallId: callId, content: [{ type: 'text', text: JSON.stringify({ ok: true, data: { runId, status: 'queued' } }) }] } } }) as any;

test('chat replay pairs native Run calls, rejects unrelated receipts, and restores multiple runs without duplicates', () => {
    const empty = { turn: 1, calls: {}, runs: [] };
    assert.equal(reduceRunHistory(empty, result()), empty, 'An arbitrary JSON response must not create a card');
    let state = reduceRunHistory(empty, call());
    state = reduceRunHistory(state, result());
    state = reduceRunHistory(state, result());
    state = reduceRunHistory(state, call('call-2'));
    state = reduceRunHistory(state, result('call-2', id2));
    assert.deepEqual(state.runs, [{ runId: id, title: 'report_tool' }, { runId: id2, title: 'report_tool' }]);
    assert.equal(runDefinition.match(call('other', 'other_tool')), null);
    const failed = result(); failed.data.message.isError = true;
    assert.equal(reduceRunHistory(empty, failed), empty);
    const base = 'http://localhost:9999/chat';
    const valid = `/api/sf-runtime/download?sessionId=s&runId=${id}&artifactId=f`;
    assert.equal(downloadHref(valid, 's', id, 'f', base), new URL(valid, base).href);
    assert.throws(() => downloadHref('https://example.com' + valid, 's', id, 'f', base));
    assert.throws(() => downloadHref(valid, 'another-session', id, 'f', base));
});

test('built chat card uses generated Runtime Remote, updates progress, reports errors, downloads retained files and cancels', { timeout: 20000 }, async () => {
    const { JSDOM } = hostRequire('jsdom');
    const dom = new JSDOM('<!doctype html><html><head></head><body><div id="mount"></div></body></html>', { url: 'http://localhost:9999/chat' });
    const saved = new Map<string, PropertyDescriptor | undefined>();
    for (const name of ['window', 'document', 'navigator', 'HTMLElement', 'Node']) {
        saved.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
        Object.defineProperty(globalThis, name, { configurable: true, value: dom.window[name], writable: true });
    }
    const actSetting = Object.getOwnPropertyDescriptor(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    const React = uiRequire('react'), { createRoot } = uiRequire('react-dom/client');
    const root = createRoot(dom.window.document.getElementById('mount'));
    const ctx = new Context(), registrations: any[] = [], definitions: any[] = [], calls: string[] = [], downloads: string[] = [], finished: any[] = [], opened: string[] = [];
    let client: any, pending: (() => void) | undefined, waitAborted = 0;
    let run: RunRecord = { apiVersion: '1.0', runId: id, toolId: 'report_tool', status: 'queued', createdAt: '2026-10-30T00:00:00Z', model: { provider: 'synthetic-provider', model: 'synthetic-model' }, logs: [], issues: [], artifacts: [], lastSeq: 0 };
    const payload = (data: unknown) => ({ ok: true, value: { ok: true, data: JSON.parse(JSON.stringify(data)) } });
    const file = { artifactId: 'file-1', name: '报告.docx', kind: 'final' as const, relativePath: 'final/report.docx', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', size: 64 };
    const deliveries = [
        { ...file, artifactId: 'delivery-zip', name: 'requirements.zip', relativePath: 'final/requirements.zip', mime: 'application/zip' },
        { ...file, artifactId: 'delivery-summary', name: 'final.md', relativePath: 'final/requirements/final.md', mime: 'text/markdown' },
    ];
    const intermediates = Array.from({ length: 30 }, (_, i) => ({ artifactId: 'image-' + i, name: `img_${i}.png`, kind: 'intermediate' as const, relativePath: `intermediate/img_${i}.png`, mime: 'image/png', size: 16 }));
    const intermediateDirectories = [{ path: `D:/synthetic/outputs/runs/${id}/intermediate`, fileCount: intermediates.length }];
    dom.window.HTMLAnchorElement.prototype.click = function() { downloads.push(this.href); };
    const settle = async () => { await delay(20); };
    const paint = async (props: any) => {
        const factory = registrations.find(r => r.options.name === 'softwareFactory.runCard');
        await React.act(async () => { root.render(React.createElement(factory.component, { runtimeSessionId: 'source-session', title: '生成报告', onFinished: (value: any) => finished.push(value), ...props })); await settle(); });
    };
    const advance = async (changes: Partial<RunRecord>) => React.act(async () => { run = { ...run, ...changes, lastSeq: run.lastSeq + 1 }; pending?.(); await settle(); });
    try {
        await ctx.plugin(TypertRegistry);
        ctx.provide('connection', {
            start: () => ({ stop() {} }), registerGenerationSource: () => () => {},
            rpc: { open: async function* () {}, call: async (path: string, endpoint: string, payloadInput: any, signal: AbortSignal) => {
                assert.equal(path, '/api'); calls.push(endpoint);
                const args = JSON.parse(JSON.stringify(payloadInput.args));
                assert.equal(args.runtimeSessionId, 'source-session');
                assert.equal(args.request.runId, run.runId);
                if (endpoint === 'sfRuntime/getRun') return payload(run);
                if (endpoint === 'sfRuntime/waitRun') {
                    assert.equal(args.request.waitMs, 15000);
                    await new Promise<void>((resolve, reject) => {
                        const cleanup = () => { signal.removeEventListener('abort', abort); pending = undefined; };
                        const abort = () => { waitAborted++; cleanup(); reject(signal.reason); };
                        pending = () => { cleanup(); resolve(); };
                        signal.addEventListener('abort', abort, { once: true });
                    });
                    return payload({ run, events: [], lastSeq: run.lastSeq });
                }
                if (endpoint === 'sfRuntime/getArtifact') {
                    const delivery = run.result?.files.find(f => f.artifactId === args.request.artifactId);
                    assert.ok(delivery, 'Only request downloads from the declared delivery list');
                    return payload({ ...delivery, downloadUrl: `/api/sf-runtime/download?sessionId=source-session&runId=${run.runId}&artifactId=${delivery.artifactId}` });
                }
                if (endpoint === 'sfRuntime/cancelRun') { run = { ...run, status: 'cancelled', lastSeq: run.lastSeq + 1 }; pending?.(); return payload({ runId: run.runId, status: run.status }); }
                throw new Error(endpoint);
            } },
        } as any);
        await ctx.plugin(ClientGateway);
        await ctx.plugin({ apply(scope: Context) { scope.provide('remote.session', {
            modelCatalog: async () => ({ ok: true, value: { groups: [] } }),
            openWorkspacePath: async (request: any) => { opened.push(request.path); return { ok: true, value: { opened: true } }; },
        } as any); } });
        ctx.provide('locale', { register: () => () => {}, bind: () => (key: string) => ({ model: '执行模型', cancelled: '已取消', cancel: '取消', failed: '执行失败', download: '下载' }[key] ?? key) } as any);
        ctx.provide('layout', { selectPanel() {}, panelInfo: { getSnapshot: () => ({ activePanelId: null }) } } as any);
        ctx.provide('uiConversation', { events: { register: (definition: any) => definitions.push(definition) } } as any);
        ctx.provide('slots', { inject: (_name: string, fn: Function) => fn(), register: (options: any, component: any) => { registrations.push({ options, component }); return () => {}; }, registerFactory: (options: any, component: any) => { registrations.push({ options, component }); return () => {}; } } as any);
        dom.window.__ModuleLoader__ = { load: (definition: any) => { client = definition.factory(uiRequire); } };
        runInNewContext(await readFile(resolve('packages/webui/lib/client.js'), 'utf8'), { window: dom.window, document: dom.window.document, URL, fetch, AbortController, structuredClone, sessionStorage: dom.window.sessionStorage, setTimeout, clearTimeout, console });
        const fiber = await ctx.plugin(client);
        assert.equal(definitions.length, 2);
        assert.ok(registrations.find(r => r.options.name === 'conversation.chat.turnTail'));
        await paint({ runId: id });
        const doc = dom.window.document;
        assert.ok(doc.body.textContent.includes('synthetic-model'));
        assert.equal(doc.querySelector('[role=progressbar]')!.getAttribute('aria-valuenow'), null, 'No invented progress');
        await advance({ status: 'running', stage: 'draft', stageName: '撰写报告', progress: 68, message: '正在分析材料', logs: [{ time: run.createdAt, stage: 'draft', message: '已读取材料' }] });
        assert.ok(doc.body.textContent.includes('撰写报告'));
        assert.equal(doc.querySelector('[role=progressbar]')!.getAttribute('aria-valuenow'), '68');
        await advance({ status: 'failed', issues: [{ time: run.createdAt, level: 'error', stage: 'draft', message: '合成错误：材料不完整' }], artifacts: [file, ...intermediates], intermediateDirectories });
        assert.ok(doc.querySelector('[role=alert]')!.textContent.includes('draft · 合成错误'));
        assert.equal(finished.length, 1); assert.equal(finished[0].status, 'failed');
        assert.equal(finished[0].files.length, 0, 'A failed task without a result must not promote registered artifacts to deliveries');
        assert.equal(doc.querySelectorAll('.sf-run-files button').length, 0);
        assert.equal(doc.querySelectorAll('.sf-run-directories button').length, 1);
        assert.equal(doc.body.textContent.includes('img_0.png'), false, 'Do not list each intermediate file');
        const directory = doc.querySelector('.sf-run-directories button') as HTMLButtonElement;
        await React.act(async () => { directory.click(); await settle(); });
        assert.deepEqual(opened, [intermediateDirectories[0].path]);
        await paint({ runId: id }); assert.equal(finished.length, 1, 'Rerender must not repeat the terminal callback');
        run = { ...run, runId: id2, status: 'running', issues: [], result: undefined, lastSeq: 0 };
        await paint({ runId: id2 });
        const cancel = [...doc.querySelectorAll('button')].find((b: any) => b.textContent === '取消') as any;
        await React.act(async () => { cancel.click(); await settle(); });
        assert.equal(doc.querySelector('.sf-run-card')!.getAttribute('data-status'), 'cancelled');
        assert.equal(finished.at(-1).status, 'cancelled');
        // Restored completed task: text and final download, without an active wait loop.
        run = { ...run, runId: id, status: 'completed', result: { text: '报告已生成', files: deliveries }, artifacts: [...deliveries, file, ...intermediates], intermediateDirectories, lastSeq: 9 };
        const before = calls.filter(c => c === 'sfRuntime/waitRun').length;
        await paint({ runId: id });
        assert.ok(doc.body.textContent.includes('报告已生成'));
        assert.equal(doc.querySelectorAll('.sf-run-files button').length, 2, 'Show result.files only, even when the artifact index contains more final files');
        assert.equal(doc.body.textContent.includes('报告.docx'), false);
        assert.deepEqual(Array.from(finished.at(-1).files, (f: any) => f.artifactId), deliveries.map(f => f.artifactId));
        const download = [...doc.querySelectorAll('button')].find((b: any) => b.textContent.includes('requirements.zip')) as HTMLButtonElement;
        await React.act(async () => { download.click(); await settle(); });
        assert.equal(downloads.length, 1); assert.ok(downloads[0].includes(`runId=${id}`));
        assert.equal(doc.querySelectorAll('.sf-run-directories button').length, 1, 'Restore intermediate directories with completed tasks');
        assert.equal(calls.filter(c => c === 'sfRuntime/waitRun').length, before);
        run = { ...run, runId: id2, status: 'running', lastSeq: 0 };
        await paint({ runId: id2 });
        await React.act(async () => { root.unmount(); await settle(); });
        assert.ok(waitAborted > 0, 'Unmount cancels pending Remote calls');
        await fiber.dispose();
    } finally {
        await React.act(async () => root.unmount());
        await ctx.fiber.dispose(); dom.window.close();
        for (const [name, descriptor] of saved) { if (descriptor) Object.defineProperty(globalThis, name, descriptor); else Reflect.deleteProperty(globalThis, name); }
        if (actSetting) Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', actSetting); else Reflect.deleteProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
    }
});
