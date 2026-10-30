/** Built browser module, real React/DOM; this is not a live DSH browser acceptance test. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { resolve, join } from 'node:path';
import { fixture } from '../../manage/tests/fixture.ts';
import { metadataFixture } from './metadata-fixture.ts';
const host = resolve(process.env.DSH_SOURCE ?? '../DSH-Softwarefactory'), hostRequire = createRequire(join(host, 'package.json')), uiRequire = createRequire(join(host, 'packages/client/ui-primitives/package.json'));
test('built Client defaults to root children, centers/zooms the canvas, and keeps edit-only context menus', async () => {
  const { JSDOM } = hostRequire('jsdom'), dom = new JSDOM('<!doctype html><html><head></head><body><div id="mount"></div></body></html>', { url: 'http://localhost:9999' });
  const saved = new Map<string, PropertyDescriptor | undefined>();
  for (const name of ['window', 'document', 'navigator', 'HTMLElement', 'Node', 'MutationObserver']) { saved.set(name, Object.getOwnPropertyDescriptor(globalThis, name)); Object.defineProperty(globalThis, name, { configurable: true, value: dom.window[name], writable: true }); }
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  dom.window.HTMLElement.prototype.scrollTo = function() {}; dom.window.confirm = () => false;
  Object.defineProperty(dom.window.HTMLElement.prototype, 'clientWidth', { configurable: true, get() { return this.classList.contains('sf-canvas') ? 800 : 0; } });
  Object.defineProperty(dom.window.HTMLElement.prototype, 'clientHeight', { configurable: true, get() { return this.classList.contains('sf-canvas') ? 600 : 0; } });
  const React = uiRequire('react'), { createRoot } = uiRequire('react-dom/client'), f = fixture(), signal = new AbortController().signal;
  for (const row of metadataFixture()) f.db.vertices.set(row.vertexId, { id: row.vertexId, label: row.label, properties: row.properties });
  for (const [id, name] of [['a', '合成分类A'], ['b', '合成分类B'], ['a1', '合成子层A'], ['b1', '合成子层B']])
    f.db.vertices.set(id, { id, label: 'Capability', properties: { name } });
  for (const [parent, child] of [['root', 'a'], ['root', 'b'], ['a', 'a1'], ['b', 'b1']]) f.db.edge('HAS_CHILD', parent, child);
  const registrations: any[] = [], effects: Function[] = [];
  let module: any; dom.window.__ModuleLoader__ = { load: (definition: any) => { module = definition.factory(uiRequire); } }; const remote = {
    hugegraphRead: { snapshot: async (options: any) => ({ ok: true, value: await f.gateway.snapshot(JSON.parse(JSON.stringify(options))) }), read: async (query: any) => ({ ok: true, value: await f.gateway.read(JSON.parse(JSON.stringify(query))) }) },
    sfManage: {
      listDrafts: async () => ({ ok: true, value: { ok: true, data: f.drafts.list() } }),
      createDraft: async (_token: string, request: any) => ({ ok: true, value: { ok: true, data: await f.drafts.create(request, signal) } }),
      updateDraft: async (_token: string, request: any) => ({ ok: true, value: { ok: true, data: await f.drafts.update(request) } }),
      stageUpdate: async (_token: string, request: any) => ({ ok: true, value: { ok: true, data: await f.drafts.stageUpdate(request, signal) } }),
      ensureAssistant: async () => ({ ok: true, value: { ok: false, error: { code: 'DEPENDENCY_UNAVAILABLE', message: 'Synthetic: no model' } } }),
      stageDelete: async (_token: string, request: any) => ({ ok: true, value: { ok: true, data: await f.drafts.stageDelete(request, signal) } }),
      previewChanges: async (_token: string, request: any) => ({ ok: true, value: { ok: true, data: await f.commits.preview(request.draftId, request.expectedRevision, 'test-ui', signal) } }),
    },
  };
  let retained = 0, released = 0;
  const sessions = { list: { getSnapshot: () => ({ byId: {} }) }, retain: () => { retained++; return { ready: Promise.resolve(), release() { released++; } }; } };
  const ctx: any = {
    get: (name: string) => name === 'remote' ? remote : name === 'sessions' ? sessions : undefined,
    inject: (_names: string[], factory: Function) => factory(ctx),
    effect: (factory: Function) => { const cleanup = factory(); if (typeof cleanup === 'function') effects.push(cleanup); return cleanup; },
    locale: { register: () => () => {}, bind: () => (key: string) => key === 'overview' ? '软件工厂概览' : key === 'orchestration' ? 'Agent 编排' : '软件工厂入库' },
    layout: { selectPanel() {}, panelInfo: { getSnapshot: () => ({ activePanelId: null }) } },
    slots: { inject: (_name: string, factory: Function) => factory(), register: (options: any, component: any) => { registrations.push({ options, component }); return () => {}; }, registerFactory: (options: any, component: any) => { registrations.push({ options, component, factory: true }); return () => {}; } },
  };
  const root = createRoot(dom.window.document.getElementById('mount'));
  try {
    runInNewContext(await readFile(resolve(process.env.SF_WEBUI_CLIENT_FILE ?? 'packages/webui/lib/client.js'), 'utf8'), { window: dom.window, document: dom.window.document, fetch: async () => Response.json({ ok: true, data: { token: 'synthetic-ui', expiresAt: new Date(Date.now() + 600000).toISOString() } }), sessionStorage: dom.window.sessionStorage, localStorage: dom.window.localStorage, AbortController, structuredClone, setTimeout, clearTimeout, console });
    assert.ok(module.apply); module.apply(ctx);
    const sidebar = registrations.filter(r => r.options.name === 'sidebar.panellist'); assert.equal(sidebar.length, 3);
    assert.deepEqual(sidebar.map(r => r.options.label()), ['Agent 编排', '软件工厂概览', '软件工厂入库']);
    const panel = registrations.find(r => r.options.key === 'software-factory-overview');
    const props = { ...panel.options.inject(), renderFactorySlot: (name: string, input: any) => {
      const factory = registrations.find(r => r.factory && r.options.name === name);
      assert.ok(factory, 'The main entry must delegate to its registered shared factory');
      return React.createElement(factory.component, { ...factory.options.inject(), ...input, SessionProvider: (p: any) => p.children, renderSlot: () => null });
    } };
    const settle = async () => { await new Promise(resolve => setTimeout(resolve, 10)); };
    await React.act(async () => { root.render(React.createElement(panel.component, props)); await settle(); });
    await React.act(async () => { await settle(); });
    assert.ok(dom.window.document.querySelector('.sf-tree')); assert.ok(dom.window.document.querySelector('.sf-canvas')); assert.ok(dom.window.document.querySelector('.sf-detail'));
    const doc = dom.window.document;
    const nodes = () => [...doc.querySelectorAll('.sf-node')];
    const button = (text: string) => [...doc.querySelectorAll('button')].find((el: any) => el.textContent === text) as any;
    const clickLabel = async (label: string) => React.act(async () => (doc.querySelector(`button[aria-label="${label}"]`) as any).click());
    assert.equal(doc.querySelectorAll('[role=separator]').length, 2);
    const treeElement = doc.querySelector('.sf-tree');
    await clickLabel('折叠能力树');
    assert.equal(doc.querySelector('[data-pane=tree] .sf-pane-body')!.hasAttribute('hidden'), true);
    await clickLabel('展开能力树'); assert.equal(doc.querySelector('.sf-tree'), treeElement, 'Folding must not remount panel contents');
    const treePane = doc.querySelector('[data-pane=tree]') as any, canvasPane = doc.querySelector('[data-pane=canvas]') as any, detailPane = doc.querySelector('[data-pane=details]') as any;
    treePane.getBoundingClientRect = () => ({ width: 220 }); canvasPane.getBoundingClientRect = () => ({ width: 480 }); detailPane.getBoundingClientRect = () => ({ width: 300 });
    const handle = doc.querySelector('[role=separator]') as any;
    handle.setPointerCapture = () => {}; handle.releasePointerCapture = () => {};
    const pointer = (type: string, clientX: number) => { const event = new dom.window.MouseEvent(type, { bubbles: true, button: 0, clientX }); Object.defineProperty(event, 'pointerId', { value: 1 }); return event; };
    await React.act(async () => handle.dispatchEvent(pointer('pointerdown', 220)));
    await React.act(async () => handle.dispatchEvent(pointer('pointermove', 260)));
    await React.act(async () => handle.dispatchEvent(pointer('pointerup', 260)));
    const layout = JSON.parse(dom.window.localStorage.getItem('sf-layout:v1:overview-inner:read')!);
    assert.equal(layout.weights.tree, 26); assert.equal(layout.weights.canvas, 44);
    await clickLabel('折叠节点详情'); await clickLabel('展开节点详情');
    const camera = () => {
      const values = doc.querySelector('.sf-canvas svg > g')!.getAttribute('transform')!.match(/translate\(([-\d.e+]+) ([-\d.e+]+)\) scale\(([-\d.e+]+)\)/)!;
      return { x: Number(values[1]), y: Number(values[2]), scale: Number(values[3]) };
    };
    assert.equal(nodes().length, 3, 'Only root and its two immediate children start visible');
    assert.equal(doc.querySelectorAll('.sf-tree-row').length, 3);
    const fitted = camera();
    const positions = [...doc.querySelectorAll('foreignObject')].map((el: any) => ({ x: Number(el.getAttribute('x')), y: Number(el.getAttribute('y')) }));
    const centerX = (Math.min(...positions.map(p => p.x)) + Math.max(...positions.map(p => p.x + 202))) / 2;
    const centerY = (Math.min(...positions.map(p => p.y)) + Math.max(...positions.map(p => p.y + 108))) / 2;
    assert.ok(Math.abs(fitted.x + centerX * fitted.scale - 400) < 1e-8);
    assert.ok(Math.abs(fitted.y + centerY * fitted.scale - 300) < 1e-8);
    const wheel = new dom.window.WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: -120, clientX: 200, clientY: 180 });
    await React.act(async () => { doc.querySelector('.sf-canvas')!.dispatchEvent(wheel); });
    const zoomed = camera();
    assert.ok(wheel.defaultPrevented && zoomed.scale > fitted.scale);
    assert.ok(Math.abs((200 - fitted.x) / fitted.scale - (200 - zoomed.x) / zoomed.scale) < 1e-8);
    await React.act(async () => dom.window.dispatchEvent(new dom.window.Event('resize')));
    assert.deepEqual(camera(), zoomed, 'Resizing must not overwrite a manually adjusted camera');
    await React.act(async () => button('适配').click());
    assert.deepEqual(camera(), fitted);
    await React.act(async () => (nodes()[1]!.querySelector('.sf-toggle') as any).click());
    assert.equal(nodes().length, 4);
    await React.act(async () => { button('刷新').click(); await settle(); });
    assert.equal(nodes().length, 4, 'Data refresh preserves manually expanded branches');
    await React.act(async () => button('展开全部').click()); assert.equal(nodes().length, 5);
    await React.act(async () => button('收起分支').click()); assert.equal(nodes().length, 3);
    const controller = registrations.find(r => r.factory && r.options.name === 'softwareFactory.page').options.inject().controller;
    await React.act(async () => controller.select('a1'));
    assert.equal(nodes().length, 4, 'Locating a hidden target reveals only its ancestor path');
    const search = doc.querySelector('input[aria-label="搜索节点"]')!;
    const setSearch = async (value: string) => React.act(async () => {
      Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value')!.set!.call(search, value);
      search.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    });
    await setSearch('合成子层B');
    assert.equal(nodes().length, 3, 'Search reveals a matching descendant and its ancestors');
    assert.ok(nodes().some((node: any) => node.textContent.includes('合成子层B')));
    await setSearch('');
    assert.equal(nodes().length, 4, 'Clearing search restores the manually expanded branches');
    const node = dom.window.document.querySelector('.sf-node')!;
    assert.ok(node, dom.window.document.body.textContent);
    await React.act(async () => { node.dispatchEvent(new dom.window.MouseEvent('contextmenu', { bubbles: true })); }); assert.equal(dom.window.document.querySelector('[role=menu]'), null);
    const edit = [...dom.window.document.querySelectorAll('button')].find((el: any) => el.textContent === '修改') as any;
    await React.act(async () => { edit.click(); await settle(); });
    assert.equal(doc.querySelectorAll('[role=separator]').length, 3);
    const controllerForSession = registrations.find(r => r.factory && r.options.name === 'softwareFactory.page').options.inject().controller;
    await React.act(async () => { controllerForSession.set({ assistant: { sessionId: 'synthetic-assistant', workspace: 'synthetic-workspace' } }); await settle(); });
    const assistantElement = doc.querySelector('.sf-assistant');
    await clickLabel('折叠AI 草稿助手'); await clickLabel('展开AI 草稿助手');
    assert.equal(doc.querySelector('.sf-assistant'), assistantElement);
    assert.equal(retained, 1); assert.equal(released, 0, 'Folding must retain the native session reference');
    await React.act(async () => { node.dispatchEvent(new dom.window.MouseEvent('contextmenu', { bubbles: true, clientX: 100, clientY: 100 })); });
    const menu = dom.window.document.querySelector('[role=menu]')!; assert.ok(menu.textContent.includes('新增能力子节点')); assert.ok(menu.textContent.includes('新增逻辑 Agent 子节点')); assert.equal((menu.querySelector('button:last-child') as HTMLButtonElement).disabled, true);
    await React.act(async () => { menu.querySelector('button')!.click(); }); assert.ok(dom.window.document.querySelector('input[aria-label="节点名称"]'));
    await React.act(async () => button('取消').click());
    const remove = async (title: string) => {
      const target = nodes().find((el: any) => el.querySelector('strong')?.textContent === title)!;
      await React.act(async () => target.dispatchEvent(new dom.window.MouseEvent('contextmenu', { bubbles: true, clientX: 100, clientY: 100 })));
      const item = doc.querySelector('[role=menu] button:last-child') as any;
      assert.equal(item.disabled, false, title + ' should be a draft leaf');
      await React.act(async () => { item.click(); await settle(); });
    };
    await remove('合成子层A'); await remove('合成分类A');
    assert.equal(controller.getSnapshot().draft.changes.length, 2);
    assert.equal(controller.getSnapshot().error, undefined); assert.equal(f.db.writes, 0);
    f.db.vertices.set('logical', { id: 'logical', label: 'Agent', properties: { agent_id: 'agent:synthetic', name: '合成逻辑Agent', description: '合成能力' } });
    f.db.vertices.set('version', { id: 'version', label: 'AgentVersion', properties: { version: 'v1', status: 'enabled', developer: '合成开发者', input_schema: '{"description":"软件介绍","x-required":true}', output_schema: '{"description":"整理后的文档","x-file-extension":".docx"}', selection_policy_json: '{"metrics":[{"name_zh":"准确率","value":95.5,"unit":"%"}]}' } });
    f.db.edge('HAS_AGENT', 'root', 'logical'); f.db.edge('HAS_VERSION', 'logical', 'version');
    await React.act(async () => { await controller.load(); controller.select('version'); });
    const detail = doc.querySelector('.sf-detail')!.textContent!;
    assert.ok(detail.includes('版本能力描述') && detail.includes('未填写'));
    assert.ok(!detail.includes('合成能力'), 'A missing version description must not inherit the logical Agent description');
    f.db.vertices.get('version').properties.description = '此版本仅支持合成范围';
    await React.act(async () => { await controller.load(); controller.select('version'); });
    assert.ok(doc.querySelector('.sf-detail')!.textContent!.includes('此版本仅支持合成范围'));
    await React.act(async () => { controller.select('logical'); });
    assert.ok(doc.querySelector('.sf-detail')!.textContent!.includes('合成能力'));
    assert.ok(!doc.querySelector('.sf-detail')!.textContent!.includes('此版本仅支持合成范围'));
    await React.act(async () => { controller.select('version'); });
    for (const text of ['身份与治理', '开发人员', '输入规格', '软件介绍', '是否必需', '优选指标', '准确率', '95.5']) assert.ok(detail.includes(text), text);
    assert.ok(!detail.includes('input_schema') && !detail.includes('selection_policy_json') && !detail.includes('{"'));
    await React.act(async () => { button('保存').click(); await settle(); });
    assert.ok(doc.querySelector('.sf-review')!.textContent!.includes('删除叶节点'));
    assert.equal(doc.querySelector('.sf-review pre'), null);
    await React.act(async () => {
      const draft = controller.getSnapshot().draft;
      controller.set({ draft: { ...draft, context: { ...draft.context, step: 1, origin: 'manage', selected: { vertexId: 'version' } } } });
      root.render(React.createElement(panel.component, { ...props, page: 'manage' })); await settle();
    });
    assert.equal(doc.querySelectorAll('[role=separator]').length, 2);
    assert.ok(doc.querySelector('.sf-form-pane > .sf-wizard-footer'));
    assert.equal((doc.getElementById('sf-field-AgentVersion.version') as HTMLInputElement).readOnly, false);
    assert.ok(doc.querySelector('label[for="sf-field-Agent.agent_id"]')!.closest('.sf-field')!.querySelector('.sf-readonly'));
    assert.equal(doc.querySelector('.sf-form .sf-wizard-footer'), null, 'Navigation must be outside the scrolling fields');
    const input = doc.querySelector('.sf-form textarea');
    await clickLabel('折叠入库步骤'); await clickLabel('展开入库步骤'); assert.equal(doc.querySelector('.sf-form textarea'), input);
    assert.equal(retained, 1); assert.equal(released, 0, 'Changing pages must not remount the assistant');
    await React.act(async () => {
      const draft = controller.getSnapshot().draft;
      controller.set({ draft: { ...draft, context: { ...draft.context, step: 6 } } });
    });
    const form = doc.querySelector('.sf-form')!;
    assert.ok(form.textContent!.includes('逻辑 Agent 能力描述') && form.textContent!.includes('版本能力描述'));
    const description = doc.getElementById('sf-field-AgentVersion.description') as HTMLTextAreaElement;
    assert.ok(description); assert.equal(description.value, '此版本仅支持合成范围');
    assert.ok(doc.querySelector('label[for="sf-field-Agent.description"]')!.closest('.sf-field')!.querySelector('.sf-readonly'));
    const titles = Array.from(form.querySelectorAll('.sf-field-heading label'), label => label.textContent!);
    assert.ok(titles.findIndex(title => title.includes('逻辑 Agent 能力描述')) < titles.findIndex(title => title.includes('版本能力描述')));
    await React.act(async () => {
      const draft = controller.getSnapshot().draft;
      controller.set({ draft: { ...draft, context: { ...draft.context, step: 0 } } });
    });
    for (const item of doc.querySelectorAll('.sf-object-list button')) {
      const kind = item.querySelector('.sf-badge')?.textContent;
      assert.equal((item as HTMLButtonElement).disabled, kind !== 'Agent', 'Only logical Agents are selectable when moving a version');
    }
    const workspace = doc.querySelector('.sf-workspace')!;
    Object.defineProperty(workspace, 'clientWidth', { configurable: true, value: 700 });
    await React.act(async () => dom.window.dispatchEvent(new dom.window.Event('resize')));
    assert.ok(workspace.classList.contains('sf-split-stacked'));
    Object.defineProperty(workspace, 'clientWidth', { configurable: true, value: 1400 });
    await React.act(async () => dom.window.dispatchEvent(new dom.window.Event('resize')));
    assert.equal(workspace.classList.contains('sf-split-stacked'), false);
    const previousContext = { ...controller.getSnapshot().draft.context, editingVersion: { vertexId: 'version' }, selected: { vertexId: 'version' } };
    await React.act(async () => {
      controller.set({ draft: { ...controller.getSnapshot().draft, context: previousContext } });
      controller.select('logical'); root.render(React.createElement(panel.component, { ...props, page: 'overview' })); await settle();
    });
    const logicalNode = nodes().find((el: any) => el.querySelector('strong')?.textContent === '合成逻辑Agent')!;
    await React.act(async () => logicalNode.dispatchEvent(new dom.window.MouseEvent('contextmenu', { bubbles: true, clientX: 100, clientY: 100 })));
    await React.act(async () => { (doc.querySelector('[role=menu] button:nth-last-child(2)') as any).click(); await settle(); });
    const logicalId = doc.querySelector('input[aria-label="稳定 Agent ID"]') as HTMLInputElement;
    const logicalDescription = doc.querySelector('textarea[aria-label="逻辑 Agent 能力描述"]') as HTMLTextAreaElement;
    assert.equal(logicalId.readOnly, true); assert.equal(logicalId.value, 'agent:synthetic');
    assert.equal(logicalDescription.value, '合成能力');
    assert.equal(controller.getSnapshot().draft.context.editingVersion, undefined);
    await React.act(async () => {
      Object.getOwnPropertyDescriptor(dom.window.HTMLTextAreaElement.prototype, 'value')!.set!.call(logicalDescription, '仅修改逻辑能力');
      logicalDescription.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    });
    await React.act(async () => { logicalDescription.closest('form')!.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true })); await settle(); });
    assert.equal(doc.querySelector('textarea[aria-label="逻辑 Agent 能力描述"]'), null);
    assert.equal(controller.getSnapshot().error, undefined);
    assert.equal(controller.graph().nodes.find((n: any) => n.vertexId === 'logical').properties.description, '仅修改逻辑能力');
    assert.equal(controller.graph().nodes.find((n: any) => n.vertexId === 'version').properties.description, '此版本仅支持合成范围');
    assert.deepEqual(JSON.parse(JSON.stringify(controller.getSnapshot().draft.context)), JSON.parse(JSON.stringify(previousContext)));
    assert.equal(f.db.vertices.get('logical').properties.description, '合成能力'); assert.equal(f.db.writes, 0);
  } finally { await React.act(async () => root.unmount()); for (const effect of effects.reverse()) effect(); dom.window.close(); f.core.dispose(); for (const [name, descriptor] of saved) { if (descriptor) Object.defineProperty(globalThis, name, descriptor); else delete (globalThis as any)[name]; } delete (globalThis as any).IS_REACT_ACT_ENVIRONMENT; }
});
