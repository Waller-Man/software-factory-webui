/** Small UI main path: built Client/React with synthetic Remote results, no profile/model. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { resolve, join } from 'node:path';
import { reduceSelection, selectionId } from '../src/pages/orchestration/history.ts';
const host = resolve('../DSH-Softwarefactory'), hostRequire = createRequire(join(host, 'package.json')), uiRequire = createRequire(join(host, 'packages/client/ui-primitives/package.json'));
test('review stages hide raw forms, ask after manual changes, use the native model directory and confirm once', { timeout: 15000 }, async () => {
  const empty = { turn: 1, calls: [], ids: [] }, call: any = { type: 'tool/call', data: { turn: 1, callId: 'c', name: 'submit_agent_selection' } };
  const result: any = { type: 'tool/result', data: { turn: 1, message: { toolCallId: 'c', content: [{ type: 'text', text: '{"ok":true,"data":{"selectionId":"selection-1"}}' }] } } };
  assert.equal(reduceSelection(empty, result), empty);
  assert.deepEqual(reduceSelection(reduceSelection(empty, call), result).ids, ['selection-1']);
  const { JSDOM } = hostRequire('jsdom'), dom = new JSDOM('<!doctype html><html><head></head><body><div id="mount"></div></body></html>', { url: 'http://localhost:9999' });
  const saved = new Map<string, PropertyDescriptor | undefined>();
  for (const name of ['window', 'document', 'navigator', 'HTMLElement', 'Node']) { saved.set(name, Object.getOwnPropertyDescriptor(globalThis, name)); Object.defineProperty(globalThis, name, { configurable: true, writable: true, value: dom.window[name] }); }
  const actBefore = Object.getOwnPropertyDescriptor(globalThis, 'IS_REACT_ACT_ENVIRONMENT'); (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  const React = uiRequire('react'), { createRoot } = uiRequire('react-dom/client'), root = createRoot(dom.window.document.getElementById('mount'));
  const registrations: any[] = [], prepared: any[] = [], confirmed: any[] = [], runs: any[] = [];
  let module: any, missing = true, revision = 1, released = 0;
  const row = { id: 'selection-1', sessionId: 'source', revision: 1, status: 'review', complete: true, warnings: [], source: { messageId: 'm', text: '待处理文本', files: [{ attachmentId: 'sha256:file', name: '需求.docx', bytes: 16 }] }, recommendation: { versionId: 'v1', summary: '推荐第一个版本', reasons: ['业务能力匹配'], evidence: ['AgentVersion.description'], alternatives: ['另有第二个版本'], unresolved: [] }, candidates: [1, 2].map(n => ({ agent: { vertexId: 'a' + n, properties: { name: '版本候选' + n, description: '逻辑能力' } }, version: { vertexId: 'v' + n, properties: { version: '1.0', status: 'enabled', description: '具体版本能力' } } })) };
  const payload = (data: any) => ({ ok: true, value: { ok: true, data } });
  const remote = {
    getSelection: async () => payload({ ...row, revision, recommendation: { ...row.recommendation, versionId: revision === 1 ? 'v1' : 'v2' } }),
    prepareRun: async (_token: string, request: any) => { prepared.push(request); return payload({ selectionId: request.selectionId, revision, versionId: request.versionId, digest: 'd'.repeat(64), input: { text: '已绑定的真实文本' }, parameterReport: [{ name: 'path', value: '需求.docx', basis: '真实附件' }, { name: 'mode', value: 'split', basis: '接口默认处理方式' }], contract: { toolId: 'tool_' + request.versionId, supportsRun: true, inputSchema: { type: 'object', properties: { text: { type: 'string' }, title: { type: 'string' }, mode: { enum: ['split', 'convert'] } }, required: ['text'] } }, runtimeSessionId: 'worker', modelName: 'DeepSeek-V4.1-Flash', issues: request.assist ? ['助手正在更新人工选择的报告'] : missing ? ['缺少处理目标，请在聊天说明'] : [] }); },
    confirmRun: async (_token: string, request: any) => { confirmed.push(request); return payload({ runId: 'actual-run', runtimeSessionId: 'worker' }); },
  };
  let directoryState: any = { current: { provider: 'deepseek', model: 'flash' }, routable: true, pending: null, status: 'ready', failures: [], groups: [{ id: 'deepseek', name: 'DeepSeek', models: [{ id: 'flash', name: 'DeepSeek-V4.1-Flash' }, { id: 'pro', name: 'DeepSeek-V4-Pro', reasoning: { defaultEffort: 'low', efforts: [{ id: 'low', name: 'Low' }, { id: 'high', name: 'High' }] } }] }] };
  const modelSelections: any[] = [], subscribers = new Set<() => void>();
  const directory = { store: { subscribe: (fn: () => void) => { subscribers.add(fn); return () => subscribers.delete(fn); }, getSnapshot: () => directoryState }, load: async () => directoryState, select: async (selection: any) => { modelSelections.push(selection); directoryState = { ...directoryState, current: selection }; subscribers.forEach(fn => fn()); return { ok: true }; } };
  const ctx: any = { get: (key: string) => key === 'uiConversation' ? { events: { register() {} } } : key === 'remote' ? { sfOrchestration: remote } : key === 'sessions' ? { retain: (id: string) => { assert.equal(id, 'worker'); return { ready: Promise.resolve(), release() { released++; } }; } } : key === 'modelDirectories' ? { directoryFor: (id: string) => { assert.equal(id, 'worker'); return directory; } } : undefined,
    remote: {}, effect(fn: Function) { fn(); }, inject(deps: string[], fn: Function) { if (deps[0] === 'remote.sfOrchestration' || deps[0] === 'uiConversation' || deps[0] === 'sessions') fn(ctx); },
    layout: { panelInfo: { getSnapshot: () => ({ activePanelId: null }) }, selectPanel() {} },
    locale: { register: () => () => {}, bind: () => (k: string) => k },
    slots: { inject(_name: string, fn: Function) { fn(); }, register(options: any, component: any) { registrations.push({ options, component }); return () => {}; }, registerFactory(options: any, component: any) { registrations.push({ options, component }); return () => {}; } },
  };
  dom.window.__ModuleLoader__ = { load: (def: any) => { module = def.factory(uiRequire); } };
  const settle = () => new Promise(r => setTimeout(r, 15));
  try {
    runInNewContext(await readFile(resolve('packages/webui/lib/client.js'), 'utf8'), { window: dom.window, document: dom.window.document, localStorage: dom.window.localStorage, sessionStorage: dom.window.sessionStorage, fetch: async () => Response.json({ ok: true, data: { token: 'ui-only', expiresAt: Date.now() + 600000 } }), AbortController, structuredClone, setTimeout, clearTimeout, console });
    module.apply(ctx);
    const tail = registrations.find(r => r.options.id === 'software-factory-selections');
    function ModelFixture({ onReady }: any) { React.useEffect(() => { onReady(true); return () => onReady(false); }, [onReady]); return React.createElement('button', { 'data-native-model': true }, 'DeepSeek-V4.1-Flash'); }
    const renderFactorySlot = (name: string, props: any) => { runs.push({ name, props }); return name === 'softwareFactory.executionModel' ? React.createElement(ModelFixture, props) : React.createElement('div', { 'data-run': props.runId }, '执行卡片'); };
    function view(id: string) { const ids = [id]; return React.createElement(tail.component, { key: id, turn: { data: { source: () => ({ subscribe: () => () => {}, getSnapshot: () => ids }) } }, renderFactorySlot }); }
    await React.act(async () => { root.render(view('selection-1')); await settle(); });
    await React.act(async () => { await settle(); });
    const doc = dom.window.document;
    assert.ok(doc.body.textContent.includes('业务能力匹配')); assert.ok(doc.body.textContent.includes('需求.docx'));
    assert.equal(doc.querySelector('textarea'), null); assert.equal(doc.querySelector('[aria-label="执行审核"]'), null); assert.equal(doc.querySelector('[data-native-model]'), null);
    assert.ok(doc.body.textContent.includes('缺少处理目标'));
    const select = doc.querySelector('select[aria-label="最终Agent"]')!;
    await React.act(async () => { select.value = 'v2'; select.dispatchEvent(new dom.window.Event('change', { bubbles: true })); await settle(); });
    await React.act(async () => { await settle(); });
    assert.equal(prepared.at(-1).versionId, 'v2'); assert.equal(prepared.at(-1).assist, true);
    assert.equal(doc.querySelector('[aria-label="执行审核"]'), null);
    // The assistant's next report arrives with settled parameters in a new chat turn.
    revision = 2; missing = false;
    await React.act(async () => { root.render(view('selection-2')); await settle(); });
    await React.act(async () => { await settle(); });
    assert.equal(doc.querySelector('textarea'), null); assert.ok(doc.querySelector('[data-native-model]')); assert.ok(doc.body.textContent.includes('需求.docx'));
    const confirm = [...doc.querySelectorAll('button')].find((b: any) => b.textContent === '确认并执行')! as any;
    await React.act(async () => { confirm.click(); confirm.click(); await settle(); });
    assert.equal(confirmed.length, 1); assert.equal(confirmed[0].digest, 'd'.repeat(64));
    assert.ok(doc.querySelector('[data-run="actual-run"]')); assert.equal(runs.at(-1).props.runtimeSessionId, 'worker');
    assert.equal(runs.at(-1).props.modelName, 'DeepSeek-V4.1-Flash');
    // Exercise the built Factory itself: it retains the worker and uses the
    // shared native directory, without claiming a native composer's slot.
    const factory = registrations.find(r => r.options.name === 'softwareFactory.executionModel');
    assert.equal(factory.options.children, undefined);
    let modelReady = false;
    const onReady = (ready: boolean) => { modelReady = ready; };
    await React.act(async () => { root.render(React.createElement(factory.component, { runtimeSessionId: 'worker', locked: false, onReady })); await settle(); });
    await React.act(async () => { await settle(); });
    assert.equal(modelReady, true);
    const modelChoice = doc.querySelector('[aria-label="执行模型"]') as HTMLSelectElement;
    assert.equal(modelChoice.selectedOptions[0].textContent, 'DeepSeek-V4.1-Flash');
    await React.act(async () => { modelChoice.value = '1'; modelChoice.dispatchEvent(new dom.window.Event('change', { bubbles: true })); await settle(); });
    assert.deepEqual(JSON.parse(JSON.stringify(modelSelections.at(-1))), { provider: 'deepseek', model: 'pro', reasoningEffort: 'low' });
    const effortChoice = doc.querySelector('[aria-label="推理强度"]') as HTMLSelectElement;
    await React.act(async () => { effortChoice.value = 'high'; effortChoice.dispatchEvent(new dom.window.Event('change', { bubbles: true })); await settle(); });
    assert.deepEqual(JSON.parse(JSON.stringify(modelSelections.at(-1))), { provider: 'deepseek', model: 'pro', reasoningEffort: 'high' });
    await React.act(async () => { root.render(React.createElement(factory.component, { runtimeSessionId: 'worker', locked: true, onReady })); });
    assert.equal((doc.querySelector('[aria-label="执行模型"]') as HTMLSelectElement).disabled, true);
    const native = registrations.find(r => r.options.name === 'softwareFactory.orchestrationConversation');
    let nativeCall: any;
    native.component({ renderFactorySlot: (name: string, props: any, options: any) => { nativeCall = { name, props, options }; return null; } });
    assert.equal(nativeCall.name, 'conversation.content'); assert.equal(nativeCall.props.variant, 'embedded');
    assert.equal(nativeCall.props.phase, 'active');
    let requested = '';
    const blankSeat = nativeCall.options.slots.views({ renderSlot(name: string) { requested = name; return null; } });
    assert.equal(requested, 'conversation.session');
    assert.equal(blankSeat.props.className, 'sf-assistant-views');
    assert.equal(blankSeat.props.children, null, 'A blank native transcript still has a growing seat above the composer');
    const transcript = {};
    assert.equal(nativeCall.options.slots.views({ renderSlot: () => transcript }).props.children, transcript);
    await React.act(async () => { root.render(null); }); assert.equal(released, 1);
  } finally {
    await React.act(async () => root.unmount());
    if (actBefore) Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', actBefore); else delete (globalThis as any).IS_REACT_ACT_ENVIRONMENT;
    for (const [name, before] of saved) if (before) Object.defineProperty(globalThis, name, before); else delete (globalThis as any)[name];
    dom.window.close();
  }
});

