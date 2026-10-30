import type { JsonField } from '../../../contracts/src/gateway.ts';
import { defaultCatalog, fieldIdentity, type FieldCatalog } from '../pages/manage/fields.ts';

const labels: Record<string, string> = {
    name: '名称', name_zh: '中文名称', title: '标题', title_zh: '中文标题', label: '名称', description: '说明', summary: '摘要',
    version: '版本', status: '启用状态', vendor: '提供方', provider: '提供方', model: '模型', model_name: '模型名称',
    type: '类型', format: '格式', required: '必需内容', properties: '内容项', items: '列表项', enum: '可选值', default: '默认值',
    'x-artifact-kind': '材料类型', 'x-file-extension': '文件扩展名', 'x-file-extensions': '文件扩展名', 'x-media-type': '媒体类型',
    'x-required': '是否必需', 'x-allow-blank': '是否允许空白', additionalProperties: '允许扩展内容',
    evidence_kind: '证据类型', source: '来源', source_type: '来源类型', paper: '论文', paper_title: '论文标题', citation: '文献',
    url: '参考链接', dataset: '数据集', datasets: '数据集', benchmark: '评测集', experiment: '实验', experimental_model: '实验模型',
    metrics: '指标', metric: '指标', value: '数值', unit: '单位', direction: '优选方向', weight: '权重', threshold: '阈值',
    accuracy: '准确率', precision: '精确率', recall: '召回率', pass_rate: '通过率', success_rate: '成功率', latency: '耗时',
    latency_ms: '耗时（毫秒）', latency_seconds: '耗时（秒）', cost: '代价', cost_per_run: '单次运行代价', currency: '币种',
    runtime: '运行环境', python: 'Python 版本', python_version: 'Python 版本', os: '操作系统', dependencies: '依赖',
    environment: '环境', requirements: '运行要求', notes: '补充说明', limitations: '适用限制', task: '任务', effect: '效果',
    measured_at: '测量时间', tested_at: '测试时间', date: '日期', score: '得分', confidence: '置信度',
};
const values: Record<string, string> = { enabled: '已启用', disabled: '已停用', draft: '草案', able: '可用（历史状态）',
    dsh_tool: 'DSH 工具', paper: '论文证据', synthetic_test: '合成测试', synthetic: '合成数据', real: '真实数据',
    text: '文本', file: '文件', image: '图片', object: '内容对象', array: '列表', string: '文本', number: '数值', integer: '整数', boolean: '是/否',
    maximize: '越大越优', minimize: '越小越优', max: '越大越优', min: '越小越优' };
export const kindTitle = (kind: string) => ({ Capability: '能力分类', Agent: '逻辑 Agent', AgentVersion: 'Agent 版本' } as Record<string, string>)[kind] ?? kind;
export const fieldTitle = (key: string, kind?: string, catalog = defaultCatalog) => (kind ? catalog.fields.find(field => field.object === kind && field.key === key)?.title : undefined) ?? labels[key] ?? key.replaceAll('_', ' ');

function Content({ value, depth = 0 }: { value: unknown; depth?: number }) {
    if (value === undefined || value === null || value === '') return <span className="sf-muted">未声明</span>;
    if (typeof value === 'boolean') return <span>{value ? '是' : '否'}</span>;
    if (typeof value !== 'object') return <span className="sf-value-text">{values[String(value)] ?? String(value)}</span>;
    if (Array.isArray(value)) return value.length ? <ul className="sf-value-list">{value.map((item, index) => <li key={index}><Content value={item} depth={depth + 1}/></li>)}</ul> : <span className="sf-muted">未声明</span>;
    const entries = Object.entries(value);
    return entries.length ? <dl className={`sf-value-object ${depth ? 'sf-value-nested' : ''}`}>{entries.map(([key, item]) => <div key={key}><dt>{fieldTitle(key)}</dt><dd><Content value={item} depth={depth + 1}/></dd></div>)}</dl> : <span className="sf-muted">未声明</span>;
}
export function FieldValue({ field, kind, value, parsed, catalog = defaultCatalog }: { field: string; kind?: string; value: unknown; parsed?: JsonField; catalog?: FieldCatalog }) {
    if (kind === 'AgentVersion' && field === 'description' && (value === undefined || value === null || value === '')) return <span className="sf-muted">未填写</span>;
    const json = kind ? catalog.fields.find(item => item.object === kind && item.key === field)?.json : field.endsWith('_json') || field.endsWith('_schema');
    if (!json) return <Content value={value}/>;
    if (value === undefined || value === null || value === '') return <Content value={undefined}/>;
    if (parsed?.state === 'invalid') return <span role="status" className="sf-muted">资料格式需要修正，暂无法分项展示</span>;
    if (parsed?.state === 'parsed') return <Content value={parsed.value}/>;
    try { return <Content value={typeof value === 'string' ? JSON.parse(value) : value}/>; }
    catch { return <span role="status" className="sf-muted">资料格式需要修正，暂无法分项展示</span>; }
}
export function PropertyGroups({ kind, properties, jsonFields, catalog = defaultCatalog }: { kind: string; properties: Record<string, unknown>; jsonFields?: Record<string, JsonField>; catalog?: FieldCatalog }) {
    const { fields, groups } = catalog;
    if (kind === 'Capability') return <section className="sf-property-group"><h4>分类信息</h4><dl className="sf-properties"><dt>分类名称</dt><dd><FieldValue field="name" value={properties.name}/></dd></dl></section>;
    return <>{groups.slice(1).map((group, index) => {
        const items = fields.filter(field => field.object === kind && field.group === index + 1);
        return items.length ? <section className="sf-property-group" key={group}><h4>{group}</h4><dl className="sf-properties">{items.map(field => <div key={fieldIdentity(field)}><dt>{field.title}</dt><dd><FieldValue field={field.key} kind={kind} catalog={catalog} value={properties[field.key]} parsed={jsonFields?.[field.key]}/></dd></div>)}</dl></section> : null;
    })}</>;
}
