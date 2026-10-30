/** Real Cordis + DSH Client Gateway + generated codecs; only transport/database are synthetic. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { resolve, join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { Context } from '@deepseek-ai/cordis';
import TypertRegistry from '@deepseek-ai/dsh-typert-registry';
import * as ClientGateway from '@deepseek-ai/dsh-api-gateway/src/client/index.ts';
import readContribution from '../../gateway/lib/typert.remote-client.js';
import manageContribution from '../../manage/lib/typert.remote-client.js';
import { fixture } from '../../manage/tests/fixture.ts';
import type { Controller } from '../src/shared/controller.ts';

const host = resolve(process.env.DSH_SOURCE ?? '../DSH-Softwarefactory');
const hostRequire = createRequire(join(host, 'package.json'));
const uiRequire = createRequire(join(host, 'packages/client/ui-primitives/package.json'));
async function until(check: () => boolean, detail: () => unknown = () => undefined) {
  for (let i = 0; i < 100; i++) { if (check()) return; await delay(10); }
  assert.ok(check(), 'Remote lifecycle did not settle: ' + JSON.stringify(detail()));
}

test('built Client uses injected Remote namespaces, including late enable and disable/re-enable', { timeout: 15000 }, async () => {
  const { JSDOM } = hostRequire('jsdom');
  const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', { url: 'http://localhost:9999' });
  const ctx = new Context(), f = fixture(), signal = new AbortController().signal;
  const calls: string[] = [], registrations: any[] = [];
  let client: any, bootstraps = 0;
  try {
    await ctx.plugin(TypertRegistry);
    ctx.provide('connection', {
      start: () => ({ stop() {} }), registerGenerationSource: () => () => {},
      rpc: {
        open: async function* () { throw new Error('This test must not open a stream'); },
        call: async (path: string, endpoint: string, payload: any) => {
          assert.equal(path, '/api'); calls.push(endpoint);
          // Match the real wire boundary: browser VM objects become Host JSON values.
          const args = JSON.parse(JSON.stringify(payload.args));
          if (endpoint === 'hugegraphRead/snapshot') return { ok: true, value: await f.gateway.snapshot(args.options) };
          if (endpoint === 'hugegraphRead/read') return { ok: true, value: await f.gateway.read(args.query) };
          assert.equal(args.token, 'synthetic-ui');
          let data: unknown;
          if (endpoint === 'sfManage/listDrafts') data = f.drafts.list();
          else if (endpoint === 'sfManage/createDraft') data = await f.drafts.create(args.request, signal);
          else if (endpoint === 'sfManage/getDraft') data = f.drafts.load(args.request.draftId);
          else if (endpoint === 'sfManage/stageCreate') data = await f.drafts.stageCreate(args.request, signal);
          else if (endpoint === 'sfManage/stageMoveVersion') data = await f.drafts.stageMoveVersion(args.request, signal);
          else if (endpoint === 'sfManage/previewChanges') data = await f.commits.preview(args.request.draftId, args.request.expectedRevision, 'ui-test', signal);
          else throw new Error('Unexpected Remote call: ' + endpoint);
          return { ok: true, value: { ok: true, data } };
        },
      },
    } as any);
    await ctx.plugin(ClientGateway);
    ctx.provide('locale', { register: () => () => {}, bind: () => (key: string) => key } as any);
    ctx.provide('layout', { selectPanel() {}, panelInfo: { getSnapshot: () => ({ activePanelId: null }) } } as any);
    // Only slot rendering is omitted here; activation.test.ts covers the real SlotRegistry.
    ctx.provide('slots', {
      inject: (_name: string, factory: () => unknown) => factory(),
      register: (options: any, component: any) => { registrations.push({ options, component }); return () => {}; },
      registerFactory: (options: any, component: any) => { registrations.push({ options, component }); return () => {}; },
    } as any);
    dom.window.__ModuleLoader__ = { load: (definition: any) => { client = definition.factory(uiRequire); } };
    runInNewContext(await readFile(resolve(process.env.SF_WEBUI_CLIENT_FILE ?? 'packages/webui/lib/client.js'), 'utf8'), {
      window: dom.window, document: dom.window.document,
      fetch: async function(this: any, input: string, init: RequestInit) {
        assert.equal(this.window, dom.window, 'Native fetch must receive its global context, not the Api instance');
        assert.equal(input, '/api/sf-manage/ui-session');
        assert.equal(init.credentials, 'same-origin');
        bootstraps++;
        return Response.json({ ok: true, data: { token: 'synthetic-ui', expiresAt: new Date(Date.now() + 600000).toISOString() } });
      },
      AbortController, structuredClone, sessionStorage: dom.window.sessionStorage, setTimeout, clearTimeout, console,
    });
    const ui = await ctx.plugin(client);
    const c: Controller = registrations.find(r => r.options.name === 'softwareFactory.page').options.inject().controller;
    assert.equal(registrations.filter(r => r.options.name === 'main').length, 3);
    await assert.rejects(c.api.snapshot(), { code: 'GATEWAY_UNAVAILABLE' });
    await assert.rejects(c.api.call('listDrafts', {}), { code: 'MANAGE_UNAVAILABLE' });
    assert.equal(calls.length, 0);
    await c.load();

    const mount = (contribution: any) => ctx.get('remote').$mount(contribution);
    let stopRead = await mount(readContribution);
    await until(() => !!c.getSnapshot().graph && !c.getSnapshot().busy, () => ({ state: c.getSnapshot(), calls }));
    assert.equal(c.getSnapshot().error, undefined);
    assert.equal(c.getSnapshot().complete, true);
    assert.ok(c.getSnapshot().notice?.includes('Manage'));
    assert.equal((await c.api.node('root')).node.vertexId, 'root');

    let stopManage = await mount(manageContribution);
    await until(() => calls.includes('sfManage/listDrafts') && c.getSnapshot().notice === undefined);
    const draft = await c.api.call('createDraft', { mode: 'overview', title: '合成草稿' });
    c.set({ draft, editing: true });
    await c.add('Capability', { vertexId: 'root' }, { name: '合成能力' });
    assert.equal(c.getSnapshot().error, undefined);
    assert.equal(c.getSnapshot().draft!.changes.length, 1);
    await c.preview();
    assert.ok(c.getSnapshot().preview);
    const revision = c.getSnapshot().draft!.revision;

    await stopManage();
    await until(() => c.getSnapshot().preview === undefined);
    const before = calls.length;
    await assert.rejects(c.api.call('listDrafts', {}), { code: 'MANAGE_UNAVAILABLE' });
    assert.equal(calls.length, before, 'A withdrawn namespace must not be called through a stale reference');
    assert.equal(c.getSnapshot().draft!.revision, revision);
    assert.equal((await c.api.snapshot()).graph.nodes.length, 1, 'Gateway browsing survives Manage withdrawal');

    stopManage = await mount(manageContribution);
    await until(() => c.getSnapshot().notice === undefined);
    assert.equal((await c.api.call('getDraft', { draftId: draft.id })).revision, revision);
    assert.equal(bootstraps, 2, 'Re-enabled Manage obtains a fresh UI session');
    await stopRead();
    await until(() => !c.getSnapshot().complete);
    await assert.rejects(c.api.snapshot(), { code: 'GATEWAY_UNAVAILABLE' });
    assert.equal(c.getSnapshot().draft!.id, draft.id);
    stopRead = await mount(readContribution);
    await until(() => c.getSnapshot().complete && !c.getSnapshot().busy);
    assert.equal(c.getSnapshot().error, undefined);
    assert.equal(f.db.writes, 0, 'Readiness changes and draft edits must never write the database');
    assert.ok(calls.includes('hugegraphRead/snapshot'));
    assert.ok(calls.includes('sfManage/stageCreate'));
    for (const id of ['parent-a', 'parent-b']) { f.db.vertices.set(id, { id, label: 'Agent', properties: { agent_id: id, name: id, description: '合成Agent' } }); f.db.edge('HAS_AGENT', 'root', id); }
    f.db.vertices.set('version', { id: 'version', label: 'AgentVersion', properties: { version: '1.0', status: 'draft', input_schema: '{}', output_schema: '{}' } }); f.db.edge('HAS_VERSION', 'parent-a', 'version');
    const moved = await c.api.call('stageMoveVersion', { draftId: draft.id, expectedRevision: c.getSnapshot().draft!.revision, target: { vertexId: 'version' }, parent: { vertexId: 'parent-b' } });
    assert.equal(moved.changes.at(-1)!.kind, 'move-version');
    assert.deepEqual(JSON.parse(JSON.stringify(moved.context.editingVersion)), { vertexId: 'version' });
    assert.equal(f.db.writes, 0); assert.ok(calls.includes('sfManage/stageMoveVersion'));
    await ui.dispose();
    await assert.rejects(c.api.call('listDrafts', {}), { code: 'MANAGE_UNAVAILABLE' });
    await assert.rejects(c.api.snapshot(), { code: 'GATEWAY_UNAVAILABLE' });
    registrations.length = 0;
    const restarted = await ctx.plugin(client);
    const restored: Controller = registrations.find(r => r.options.name === 'softwareFactory.page').options.inject().controller;
    await restored.load();
    assert.equal(restored.getSnapshot().error, undefined, 'Namespaces present before WebUI activation are also injected');
    assert.equal(restored.getSnapshot().drafts[0]!.id, draft.id);
    await restarted.dispose();
    await stopManage(); await stopRead();
  } finally { await ctx.fiber.dispose(); f.core.dispose(); dom.window.close(); }
});
