/** Real Cordis tracing + native ModelDirectoryResolver; only session transport is synthetic. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { Context, Service } from '@deepseek-ai/cordis';
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store';
import { ModelDirectoryResolver } from '@deepseek-ai/dsh-client-ui-model-selection/src/client/service.ts';
const hostRequire = createRequire(resolve('../DSH-Softwarefactory/package.json'));
const uiRequire = createRequire(resolve('../DSH-Softwarefactory/packages/client/ui-primitives/package.json'));

test('built execution model reads and selects through an injected native session directory', { timeout: 15000 }, async () => {
  const { JSDOM } = hostRequire('jsdom');
  const dom = new JSDOM('<!doctype html><html><head></head><body><div id="mount"></div></body></html>', { url: 'http://localhost:9999' });
  const saved = new Map<string, PropertyDescriptor | undefined>();
  for (const name of ['window', 'document', 'navigator', 'HTMLElement', 'Node', 'IS_REACT_ACT_ENVIRONMENT']) {
    saved.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value: name === 'IS_REACT_ACT_ENVIRONMENT' ? true : dom.window[name] });
  }
  const React = uiRequire('react'), { createRoot } = uiRequire('react-dom/client');
  const root = createRoot(dom.window.document.getElementById('mount'));
  const ctx = new Context(), factories = new Map<string, any>(), selections: any[] = [];
  let client: any, ready = false, retained = 0, released = 0, catalogCalls = 0;
  const projected = createSnapshotStore<any>({ lastUsed: null, next: { provider: 'test', model: 'flash' } });
  const binding = { session: { projections: { faceOf: () => projected }, getSnapshot: () => ({ blank: true }) } };
  class Remote extends Service { constructor(scope: Context) { super(scope, 'remote'); } $on() { return () => {}; } }
  const settle = () => new Promise(r => setTimeout(r, 15));
  const onReady = (value: boolean) => { ready = value; };
  try {
    new Remote(ctx);
    ctx.provide('slots', { inject: (_name: string, install: () => unknown) => install(), register: () => () => {}, registerFactory: (options: any, component: any) => { factories.set(options.name, component); return () => {}; } } as any);
    ctx.provide('locale', { register: () => () => {}, bind: () => (key: string) => key } as any);
    ctx.provide('layout', { selectPanel() {}, panelInfo: { getSnapshot: () => ({ activePanelId: null }) } } as any);
    ctx.provide('sessions', {
      scope: () => ctx, binding: () => binding, subagentAddress: () => undefined,
      retain: (id: string) => { assert.equal(id, 'worker'); retained++; return { ready: Promise.resolve(), release() { released++; } }; },
    } as any);
    dom.window.__ModuleLoader__ = { load: (definition: any) => { client = definition.factory(uiRequire); } };
    runInNewContext(await readFile(resolve('packages/webui/lib/client.js'), 'utf8'), { window: dom.window, document: dom.window.document, fetch, AbortController, structuredClone, sessionStorage: dom.window.sessionStorage, setTimeout, clearTimeout, console });
    const webui = await ctx.plugin(client);
    assert.ok(factories.has('softwareFactory.orchestrationPage'), 'Missing model services must leave the main page available');
    assert.equal(factories.has('softwareFactory.executionModel'), false, 'Wait for the session/model services before mounting the control');
    // A sibling plugin owns remote.session, as in the Host. Providing it on the
    // root would accidentally grant the caller access and hide the missing inject.
    const transport = await ctx.plugin({ apply(scope: Context) {
      scope.provide('remote.session', {
        modelCatalog: async () => { catalogCalls++; return { ok: true, value: { default: { provider: 'test', model: 'flash' }, groups: [{ id: 'test', name: 'Test provider', models: [{ id: 'flash', name: 'Test Flash v1' }, { id: 'pro', name: 'Test Pro v2', reasoning: { defaultEffort: 'high', efforts: [{ id: 'high', name: 'High' }] } }] }], failures: [] } }; },
        selectModel: async (request: any) => { selections.push(request); const { sessionId, ...next } = request; projected.set({ lastUsed: null, next }); return { ok: true, value: undefined }; },
      } as any);
    } });
    await ctx.plugin(ModelDirectoryResolver);
    await ctx.plugin({ inject: ['sessions', 'modelDirectories', 'remote'], apply(scope: Context) {
      assert.throws(() => scope.get('modelDirectories')!.directoryFor('worker' as any), /cannot get property "remote.session" without inject/, 'The cold native directory must enforce the caller dependency');
    } });
    const component = factories.get('softwareFactory.executionModel');
    assert.ok(component, 'Execution model factory must become available with its services');
    await React.act(async () => { root.render(React.createElement(component, { runtimeSessionId: 'worker', locked: false, onReady })); await settle(); });
    await React.act(async () => { await settle(); });
    assert.equal(dom.window.document.querySelector('[role="alert"]'), null);
    const choice = dom.window.document.querySelector('[aria-label="执行模型"]') as HTMLSelectElement;
    assert.ok(choice, dom.window.document.body.textContent ?? 'No model list');
    assert.equal(choice.selectedOptions[0].textContent, 'Test Flash v1');
    assert.equal(ready, true); assert.equal(catalogCalls, 1);
    await React.act(async () => { choice.value = '1'; choice.dispatchEvent(new dom.window.Event('change', { bubbles: true })); await settle(); });
    assert.deepEqual(JSON.parse(JSON.stringify(selections[0])), { sessionId: 'worker', provider: 'test', model: 'pro', reasoningEffort: 'high' });
    assert.equal(choice.selectedOptions[0].textContent, 'Test Pro v2'); assert.equal(ready, true);
    await React.act(async () => { root.render(null); });
    assert.equal(retained, released);
    await transport.dispose();
    assert.ok(factories.has('softwareFactory.orchestrationPage'));
    await webui.dispose();
  } finally {
    await React.act(async () => root.unmount());
    await ctx.fiber.dispose();
    for (const [name, before] of saved) if (before) Object.defineProperty(globalThis, name, before); else delete (globalThis as any)[name];
    dom.window.close();
  }
});
