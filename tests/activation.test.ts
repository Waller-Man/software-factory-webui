/** Real Cordis and DSH SlotRegistry: declaration ownership is a boot-time rule. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { resolve, join } from 'node:path';
import { Context } from '@deepseek-ai/cordis';
import { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/src/client/registry.ts';
const host = resolve(process.env.DSH_SOURCE ?? '../DSH-Softwarefactory');
const hostRequire = createRequire(join(host, 'package.json'));
const uiRequire = createRequire(join(host, 'packages/client/ui-primitives/package.json'));

for (const nativeFirst of [true, false]) test(`built WebUI coexists with the native model seat (${nativeFirst ? 'native first' : 'WebUI first'})`, async () => {
  const { JSDOM } = hostRequire('jsdom');
  const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', { url: 'http://localhost:9999' });
  const ctx = new Context(); let client: any;
  dom.window.__ModuleLoader__ = { load: (definition: any) => { client = definition.factory(uiRequire); } };
  try {
    new SlotRegistry(ctx);
    ctx.provide('locale', { register: () => () => {}, bind: () => (key: string) => key } as any);
    ctx.provide('layout', { selectPanel() {}, panelInfo: { getSnapshot: () => ({ activePanelId: null }) } } as any);
    ctx.provide('remote', {} as any);
    ctx.provide('uiConversation', { events: { register() {} } } as any);
    const slots = ctx.slots as any;
    slots.register({ name: 'root', children: { main: { kind: 'keyed', scope: 'root' }, 'test.nativeComposer': { kind: 'single', scope: 'root' }, 'sidebar.panellist': { kind: 'list', scope: 'root' }, 'tool.call.toolview': { kind: 'keyed', scope: 'session' }, 'conversation.chat.turnTail': { kind: 'list', scope: 'session' } } }, () => null);
    // The native composer owns this declaration; loading our UI must neither
    // claim it first nor collide with it when the native owner is already up.
    const mountNative = () => slots.register({ name: 'test.nativeComposer', children: { 'conversation.input.model': { kind: 'single', scope: 'session' } } }, () => null);
    if (nativeFirst) mountNative();
    runInNewContext(await readFile(resolve(process.env.SF_WEBUI_CLIENT_FILE ?? 'packages/webui/lib/client.js'), 'utf8'), {
      window: dom.window, document: dom.window.document, fetch, AbortController, structuredClone,
      sessionStorage: dom.window.sessionStorage, setTimeout, clearTimeout, console,
    });
    const fiber = await ctx.plugin(client);
    if (!nativeFirst) mountNative();
    const nativeModel = () => null;
    slots.register({ name: 'conversation.input.model' }, nativeModel);
    assert.equal(slots.entries('conversation.input.model')[0].component, nativeModel);
    assert.equal(slots.entries('main').length, 3);
    assert.equal(slots.entries('sidebar.panellist').length, 3);
    assert.equal(slots.entries('softwareFactory.conversation').length, 1);
    assert.equal(slots.entries('tool.call.toolview').length, 2);
    assert.equal(slots.entries('conversation.chat.turnTail').length, 2);
    // Exercise our public Factory composition, without mocking a native menu.
    // The native session view deliberately returns null while blank; its
    // caller-owned seat must survive to reserve room above the input/menu.
    let conversation: any;
    slots.entries('softwareFactory.conversation')[0].component({
      renderFactorySlot(name: string, input: any, options: any) {
        conversation = { name, input, options };
        return null;
      },
    });
    assert.equal(conversation.name, 'conversation.content');
    assert.equal(conversation.input.variant, 'embedded');
    assert.equal(conversation.input.phase, 'active');
    let requested = '';
    const blankSeat = conversation.options.slots.views({ renderSlot(name: string) { requested = name; return null; } });
    assert.equal(requested, 'conversation.session');
    assert.equal(blankSeat.props.className, 'sf-assistant-views');
    assert.equal(blankSeat.props.children, null);
    const transcript = {};
    const occupiedSeat = conversation.options.slots.views({ renderSlot: () => transcript });
    assert.equal(occupiedSeat.props.children, transcript, 'Reuse the native transcript, not a replacement chat');
    await fiber.dispose();
    assert.equal(slots.entries('conversation.input.model')[0].component, nativeModel, 'WebUI unload must preserve the native model seat');
    assert.equal(slots.entries('main').length, 0);
    assert.equal(slots.entries('sidebar.panellist').length, 0);
    assert.equal(slots.entries('softwareFactory.conversation').length, 0);
    assert.equal(slots.entries('tool.call.toolview').length, 0);
    assert.equal(slots.entries('conversation.chat.turnTail').length, 0);
    assert.equal(dom.window.document.querySelector('style[data-plugin="software-factory"]'), null);
    const reloaded = await ctx.plugin(client);
    assert.equal(slots.entries('main').length, 3, 'Disabling and enabling must not leave duplicate declarations');
    await reloaded.dispose();
  } finally { await ctx.fiber.dispose(); dom.window.close(); }
});
