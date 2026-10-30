import type { NodeView } from '../../../../contracts/src/gateway.ts';
export interface Field {
    id?: string;
    key: string;
    title: string;
    group: number;
    object: 'Agent' | 'AgentVersion';
    required?: boolean;
    json?: boolean;
    hint?: string;
}
export const groups = ['位置与对象', '身份与治理', '可执行与调用', '训练与评估', '适用与环境', '选择策略', '功能类', '代价类', '效果类'];
export const fields: Field[] = [
    { key: 'agent_id', title: 'Agent ID', group: 1, object: 'Agent', required: true, hint: '逻辑Agent的稳定标识，注册后不可更改' },
    { key: 'name', title: 'Agent名称', group: 1, object: 'Agent', required: true },
    { key: 'version', title: '版本号', group: 1, object: 'AgentVersion', required: true, hint: '新增和修改均可填写，同一逻辑Agent下不能重号；修改版本号不改变内部节点ID' },
    { key: 'status', title: '启用状态', group: 1, object: 'AgentVersion', required: true, hint: 'draft / enabled / disabled / able；enabled不代表Tool已验证可执行' },
    { key: 'developer', title: '开发人员', group: 1, object: 'AgentVersion', hint: '多人使用顿号分隔' },
    { key: 'invoke_kind', title: '调用方式', group: 2, object: 'AgentVersion' },
    { key: 'dsh_ref', title: '调用入口', group: 2, object: 'AgentVersion', hint: '使用真实接口名称，未知时省略' },
    { key: 'performance_evidence_json', title: '性能证据', group: 3, object: 'AgentVersion', json: true, hint: 'JSON对象。论文指标注明论文与实验模型；不编造实测记录' },
    { key: 'constraints_json', title: '运行条件', group: 4, object: 'AgentVersion', json: true, hint: 'JSON对象，未知可选值省略' },
    { key: 'model_dependencies_json', title: '模型依赖', group: 4, object: 'AgentVersion', json: true, hint: 'JSON对象数组，例如每项声明name和可选vendor；不是DSH路由ID' },
    { key: 'selection_policy_json', title: '优选指标', group: 5, object: 'AgentVersion', json: true, hint: '当前版本的JSON对象，不继承分类或逻辑Agent策略' },
    { key: 'description', title: '逻辑 Agent 能力描述', group: 6, object: 'Agent', required: true, hint: '逻辑Agent共享字段；已存在对象在版本修改时只读' },
    { key: 'description', id: 'version_description', title: '版本能力描述', group: 6, object: 'AgentVersion', hint: '当前版本独立的具体能力、范围和特点；不继承、不复制、不回写逻辑Agent描述，缺省为未填写' },
    { key: 'object_categories_json', title: '处理对象类别', group: 6, object: 'AgentVersion', json: true, hint: 'JSON字符串数组' },
    { key: 'input_schema', title: '输入规格', group: 6, object: 'AgentVersion', required: true, json: true, hint: '允许简明业务声明JSON对象：description、x-artifact-kind等；不强制完整JSON Schema' },
    { key: 'output_schema', title: '输出规格', group: 6, object: 'AgentVersion', required: true, json: true, hint: '允许简明业务声明JSON对象；参数以真实Tool接口为准' },
    { key: 'intermediate_artifacts_json', title: '中间产物', group: 6, object: 'AgentVersion', json: true, hint: 'JSON对象数组，仅声明材料和格式，不填写本次执行路径' },
    { key: 'cost_json', title: '运行代价', group: 7, object: 'AgentVersion', json: true, hint: 'JSON对象，没有依据时省略' },
    { key: 'effect_json', title: '任务效果', group: 8, object: 'AgentVersion', json: true, hint: 'JSON对象，没有依据时省略' },
];

export interface FieldCatalog { groups: string[]; fields: Field[]; source: 'metadata' | 'fallback'; warning?: string }
export const fieldIdentity = (field: Pick<Field, 'object' | 'key'>) => `${field.object}.${field.key}`;
export const defaultCatalog: FieldCatalog = { groups, fields, source: 'fallback' };
const groupIds = ['identity_governance', 'execution_invocation', 'training_evaluation', 'applicability_environment', 'selection_strategy', 'functionality', 'cost', 'effectiveness'];
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);

/** Metadata controls presentation; only explicitly supported property bindings are editable. */
export function buildFieldCatalog(rows: NodeView[]): FieldCatalog {
    const bindings = new Map(fields.map(field => [fieldIdentity(field), field]));
    const seen = new Set<string>(), ids = new Set<string>();
    const orderedGroups = groupIds.map((id, index) => ({ id, name: groups[index + 1]!, order: (index + 1) * 10 }));
    const collected: { field: Field; groupId: string; order: number }[] = [];
    let issues = false;
    for (const row of rows) {
        const group = orderedGroups.find(group => group.id === row.properties.group_id);
        if (row.label !== 'FieldGroup' || !group) { issues = true; continue; }
        const parsed = row.jsonFields?.fields_json;
        let definitions: unknown;
        try { definitions = parsed?.state === 'parsed' ? parsed.value : JSON.parse(String(row.properties.fields_json)); }
        catch { issues = true; continue; }
        if (!Array.isArray(definitions)) { issues = true; continue; }
        if (typeof row.properties.name === 'string' && row.properties.name.trim()) group.name = row.properties.name;
        if (typeof row.properties.display_order === 'number' && Number.isFinite(row.properties.display_order)) group.order = row.properties.display_order;
        for (const definition of definitions) {
            if (!record(definition) || typeof definition.field_id !== 'string' || !definition.field_id || typeof definition.name !== 'string' || !definition.name.trim() || !Array.isArray(definition.storage)) { issues = true; continue; }
            for (const storage of definition.storage) {
                if (!record(storage) || storage.kind !== 'property') continue; // Relations stay in the location controls.
                const identity = `${storage.vertex_label}.${storage.property}`, base = bindings.get(identity);
                if (!base || seen.has(identity) || ids.has(`${definition.field_id}:${identity}`)) { issues = true; continue; }
                seen.add(identity); ids.add(`${definition.field_id}:${identity}`);
                const meaning = typeof definition.meaning === 'string' ? definition.meaning : '';
                collected.push({ groupId: group.id, order: typeof definition.display_order === 'number' && Number.isFinite(definition.display_order) ? definition.display_order : Number.MAX_SAFE_INTEGER,
                    field: { ...base, id: definition.field_id, title: definition.name, hint: [meaning, base.hint].filter(Boolean).join('；') } });
            }
        }
    }
    orderedGroups.sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
    const positions = new Map(orderedGroups.map((group, index) => [group.id, index + 1]));
    // A missing/invalid definition must not silently hide an existing supported field.
    for (const base of fields) if (!seen.has(fieldIdentity(base))) {
        issues = true; collected.push({ field: { ...base }, groupId: groupIds[base.group - 1]!, order: Number.MAX_SAFE_INTEGER });
    }
    collected.sort((a, b) => positions.get(a.groupId)! - positions.get(b.groupId)! || a.order - b.order);
    return { groups: ['位置与对象', ...orderedGroups.map(group => group.name)], fields: collected.map(item => ({ ...item.field, group: positions.get(item.groupId)! })),
        source: seen.size ? 'metadata' : 'fallback', ...(issues ? { warning: '部分字段定义缺失或不受支持，已保留内置字段；请核对字段元数据。' } : {}) };
}
