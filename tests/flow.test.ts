import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from '../../manage/tests/fixture.ts';
import { Api, type ManageRemote, type ReadRemote } from '../src/shared/api.ts';
import { Controller } from '../src/shared/controller.ts';
import { overlay, rows, refOf } from '../src/pages/overview/graph.ts';
import { fields } from '../src/pages/manage/fields.ts';
function setup() {
  const f = fixture(), signal = new AbortController().signal;
  const manage = new Proxy({}, { get(_target, method: string) { return async (_token: string, input: any) => { try {
    let data: unknown;
    if (method === 'createDraft') data = await f.drafts.create(input, signal);
    else if (method === 'listDrafts') data = f.drafts.list();
    else if (method === 'getDraft') data = f.drafts.load(input.draftId);
    else if (method === 'updateDraft') data = await f.drafts.update(input);
    else if (method === 'deleteDraft') data = await f.drafts.remove(input.draftId, input.expectedRevision);
    else if (method === 'stageCreate') data = await f.drafts.stageCreate(input, signal);
    else if (method === 'stageUpdate') data = await f.drafts.stageUpdate(input, signal);
    else if (method === 'stageMoveVersion') data = await f.drafts.stageMoveVersion(input, signal);
    else if (method === 'stageDelete') data = await f.drafts.stageDelete(input, signal);
    else if (method === 'undoChange') data = await f.drafts.undo(input, signal);
    else if (method === 'previewChanges') data = await f.commits.preview(input.draftId, input.expectedRevision, 'ui-test', signal);
    else if (method === 'commitChanges') data = await f.commits.commit(input, 'ui-test', signal);
    else if (method === 'getReceipt') data = f.commits.receipt(input);
    else if (method === 'ensureAssistant') throw new Error('No model in synthetic UI test');
    else throw new Error('Unexpected request: ' + method);
    return { ok: true, value: { ok: true, data } };
  } catch (error) { return { ok: true, value: { ok: false, error: { code: (error as any).code ?? 'TEST', message: (error as Error).message } } }; } }; } }) as ManageRemote;
  const read: ReadRemote = { snapshot: async opts => ({ ok: true, value: await f.gateway.snapshot(opts) }), read: async query => ({ ok: true, value: await f.gateway.read(query) }) };
  const api = new Api(() => manage, () => read, async () => Response.json({ ok: true, data: { token: 'synthetic-ui-only', expiresAt: new Date(Date.now() + 3600000).toISOString() } }));
  const pages: string[] = [], c = new Controller(api, page => pages.push(page)); return { f, c, pages };
}
test('step 0 round trip, eight groups, draft overlay and human save use existing backend', async () => {
  const { f, c, pages } = setup();
  try {
    await c.load(); await c.create('new-agent'); await c.choose('root'); await c.chooseInOverview(); c.select('root'); await c.useSelection(); assert.equal(pages.at(-1), 'manage');
    await c.prepareVersion('root'); const graph = c.graph()!, version = graph.nodes.find(n => n.label === 'AgentVersion')!, agent = graph.nodes.find(n => n.label === 'Agent')!;
    assert.equal(c.getSnapshot().draft!.context.step, 1); assert.ok(fields.some(field => field.object === 'AgentVersion' && field.key === 'description' && !field.required));
    await c.update(refOf(agent.vertexId), { name: '合成Agent', agent_id: 'agent:synthetic-ui', description: '合成测试能力' });
    await c.update(refOf(version.vertexId), { version: '1.0', status: 'draft', input_schema: '{"description":"合成输入"}', output_schema: '{"description":"合成输出"}', intermediate_artifacts_json: '[{"name":"合成中间材料"}]' });
    await c.step(8); assert.equal(c.getSnapshot().draft!.context.step, 8); assert.equal(f.db.writes, 0);
    const before = c.getSnapshot().draft!; c.exit(); assert.equal(c.graph()!.nodes.length, 1); await c.openDraft(before.id); assert.equal(c.graph()!.nodes.length, 3);
    await c.preview(); assert.ok(c.getSnapshot().preview); assert.equal(f.db.writes, 0); await c.commit(); assert.equal(c.getSnapshot().receipt?.state, 'succeeded'); assert.equal(c.getSnapshot().editing, false); assert.equal(c.getSnapshot().graph!.nodes.length, 3); assert.equal(pages.at(-1), 'overview');
    const existing = c.getSnapshot().graph!.nodes.find(n => n.label === 'AgentVersion')!; await c.create(); await c.wizard(existing.vertexId); assert.equal(c.graph()!.nodes.find(n => n.vertexId === existing.vertexId)!.properties.version, '1.0');
    await c.update(refOf(existing.vertexId), { developer: '合成测试开发者' }); assert.equal(c.getSnapshot().draft!.changes[0]!.kind, 'update');
  } finally { c.dispose(); f.core.dispose(); }
});
test('shared nodes appear under both parents; baseline graph is untouched by overlay', () => {
  const graph: any = { rootCapabilityId: 'r', nodes: ['r','a','b','leaf'].map(vertexId => ({ vertexId, label: 'Capability', detail: 'full', properties: { name: vertexId } })), edges: [['r','a'],['r','b'],['a','leaf'],['b','leaf']].map(([outV,inV], i) => ({ id: String(i), label: 'HAS_CHILD', outV, inV })) };
  const view = overlay(graph, { changes: [{ kind: 'update', target: { vertexId: 'leaf' }, set: { name: '新名称' }, unset: [] }] } as any);
  assert.equal(rows(view, new Set(), null).filter(r => r.node.vertexId === 'leaf').length, 2); assert.equal(graph.nodes[3].properties.name, 'leaf'); assert.equal(view.nodes[3]!.pending, 'update');
});

test('editing a version selects only an Agent parent and moves the same populated version through the overview round trip', async () => {
  const { f, c } = setup();
  try {
    for (const id of ['agent-a', 'agent-b']) { f.db.vertices.set(id, { id, label: 'Agent', properties: { agent_id: id, name: id, description: '合成Agent' } }); f.db.edge('HAS_AGENT', 'root', id); }
    const id = 'av:agent-a:1.0';
    f.db.vertices.set(id, { id, label: 'AgentVersion', properties: { version: '1.0', status: 'draft', developer: '合成原值', input_schema: '{"description":"合成输入"}', output_schema: '{"description":"合成输出"}', intermediate_artifacts_json: '[{"description":"合成材料"}]' } }); f.db.edge('HAS_VERSION', 'agent-a', id);
    await c.load(); await c.create(); await c.wizard(id); await c.prepareVersion(id);
    await c.update({ vertexId: id }, { developer: '本草稿的新值' });
    await c.chooseInOverview(); assert.equal(c.getSnapshot().selected, 'agent-a');
    assert.equal(c.canSelect('root'), false); assert.equal(c.canSelect(id), false); assert.equal(c.canSelect('agent-b'), true);
    c.select('root'); assert.equal(c.getSnapshot().selected, 'agent-a');
    c.set({ selected: 'root' }); await c.useSelection(); assert.ok(c.getSnapshot().error); assert.equal(c.getSnapshot().selecting, true);
    c.select('agent-b'); await c.useSelection();
    assert.equal(c.getSnapshot().error, undefined); assert.equal(c.getSnapshot().selected, id); assert.equal(c.getSnapshot().draft!.context.step, 0);
    assert.deepEqual(c.getSnapshot().draft!.context.editingVersion, { vertexId: id });
    assert.equal(c.graph()!.nodes.length, 4); assert.ok(c.getSnapshot().draft!.changes.every(change => change.kind !== 'create'));
    assert.equal(c.graph()!.nodes.find(node => node.vertexId === id)!.properties.developer, '本草稿的新值');
    assert.equal(c.graph()!.edges.find(edge => edge.label === 'HAS_VERSION' && edge.inV === id)!.outV, 'agent-b');
    assert.equal([...f.db.edges.values()].find(edge => edge.label === 'HAS_VERSION')!.outV, 'agent-a'); assert.equal(f.db.writes, 0);
    await c.prepareVersion(id); await c.reloadDraft(); await c.choose('root'); assert.ok(c.getSnapshot().error);
    assert.equal(c.getSnapshot().draft!.context.step, 1); assert.equal(c.graph()!.nodes.length, 4);
    await c.preview(); await c.commit(); assert.equal(c.getSnapshot().receipt?.state, 'succeeded');
    assert.equal(c.getSnapshot().selected, id); assert.equal(c.getSnapshot().graph!.nodes.length, 4);
    assert.deepEqual([...f.db.edges.values()].filter(edge => edge.label === 'HAS_VERSION').map(edge => [edge.outV, edge.inV]), [['agent-b', id]]);
    assert.equal(f.db.vertices.get(id).properties.intermediate_artifacts_json, '[{"description":"合成材料"}]');
  } finally { c.dispose(); f.core.dispose(); }
});

test('one draft deletes a child then its newly-leaf parent, and commits in that order', async () => {
  const { f, c } = setup();
  try {
    for (const id of ['parent', 'child']) f.db.vertices.set(id, { id, label: 'Capability', properties: { name: id } });
    f.db.edge('HAS_CHILD', 'root', 'parent'); f.db.edge('HAS_CHILD', 'parent', 'child');
    await c.load(); await c.create();
    await c.removeNode({ vertexId: 'parent' }); assert.ok(c.getSnapshot().error);
    await c.removeNode({ vertexId: 'child' }); await c.removeNode({ vertexId: 'parent' });
    assert.equal(c.getSnapshot().error, undefined);
    assert.equal(c.getSnapshot().draft!.changes.length, 2); assert.equal(f.db.writes, 0);
    await c.preview();
    assert.deepEqual(c.getSnapshot().preview!.plan.steps.filter(step => step.operation === 'delete_node').map(step => step.beforeNode!.id), ['child', 'parent']);
    await c.commit(); assert.equal(c.getSnapshot().receipt!.state, 'succeeded');
    assert.equal(f.db.vertices.size, 1); assert.ok(f.db.vertices.has('root'));
  } finally { c.dispose(); f.core.dispose(); }
});
