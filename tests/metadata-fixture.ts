import type { NodeView } from '../../contracts/src/gateway.ts';
import { fields, groups } from '../src/pages/manage/fields.ts';
const ids = ['identity_governance', 'execution_invocation', 'training_evaluation', 'applicability_environment', 'selection_strategy', 'functionality', 'cost', 'effectiveness'];
export function metadataFixture(): NodeView[] {
  return ids.map((id, index) => {
    const definitions = fields.filter(field => field.group === index + 1).map((field, order) => ({
      field_id: field.id ?? `${field.object}_${field.key}`, name: field.title, meaning: field.hint ?? '合成字段定义', required: !!field.required,
      display_order: id === 'functionality' ? field.key === 'description' ? field.object === 'Agent' ? 10 : 15 : (order + 1) * 10 : (order + 1) * 10,
      storage: [{ kind: 'property', vertex_label: field.object, property: field.key }],
    }));
    return { vertexId: `group:${id}`, label: 'FieldGroup', detail: 'full', properties: { group_id: id, name: groups[index + 1]!, display_order: (index + 1) * 10, fields_json: JSON.stringify(definitions.reverse()) } };
  }).reverse();
}
