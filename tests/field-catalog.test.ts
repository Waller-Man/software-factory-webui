import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFieldCatalog, fieldIdentity } from '../src/pages/manage/fields.ts';
import { metadataFixture } from './metadata-fixture.ts';

test('FieldGroup presentation follows group/field order and binds descriptions by vertex label', () => {
  const metadata = metadataFixture(), group = metadata.find(row => row.properties.group_id === 'functionality')!;
  group.properties.display_order = 5;
  const definitions = JSON.parse(group.properties.fields_json as string);
  definitions.find((field: any) => field.field_id === 'version_description').name = '版本专属范围';
  group.properties.fields_json = JSON.stringify(definitions);
  const catalog = buildFieldCatalog(metadata);
  assert.equal(catalog.source, 'metadata'); assert.equal(catalog.warning, undefined);
  assert.equal(catalog.groups[1], '功能类');
  const descriptions = catalog.fields.filter(field => field.key === 'description');
  assert.deepEqual(descriptions.map(fieldIdentity), ['Agent.description', 'AgentVersion.description']);
  assert.equal(descriptions[1]!.title, '版本专属范围'); assert.equal(descriptions[1]!.id, 'version_description');
  assert.equal(descriptions[1]!.required, undefined);
  assert.equal(catalog.fields.filter(field => field.group === 1)[1]!.object, 'AgentVersion');
});

test('unsupported and malformed metadata cannot grant write bindings or hide supported fields', () => {
  const metadata = metadataFixture(), group = metadata.find(row => row.properties.group_id === 'functionality')!;
  const definitions = JSON.parse(group.properties.fields_json as string);
  definitions.push({ field_id: 'arbitrary', name: '不得写入', storage: [{ kind: 'property', vertex_label: 'AgentVersion', property: 'arbitrary' }] });
  group.properties.fields_json = JSON.stringify(definitions);
  metadata.find(row => row.properties.group_id === 'cost')!.properties.fields_json = '{broken';
  const catalog = buildFieldCatalog(metadata);
  assert.ok(catalog.warning);
  assert.ok(!catalog.fields.some(field => field.key === 'arbitrary'));
  assert.ok(catalog.fields.some(field => field.key === 'cost_json'));
  assert.ok(catalog.fields.some(field => field.object === 'AgentVersion' && field.key === 'description'));
});
