import type { FieldCatalog } from '../manage/fields.ts';
import { PropertyGroups, kindTitle } from '../../shared/FieldDisplay.tsx';
import { labelOf, type GraphNode, type ViewGraph } from './graph.ts';
export function NodeDetails({ node, graph, catalog }: { node?: GraphNode; graph?: ViewGraph; catalog?: FieldCatalog }) {
    const parents = graph?.edges.filter(edge => edge.inV === node?.vertexId).map(edge => graph.nodes.find(item => item.vertexId === edge.outV)).filter((item): item is GraphNode => !!item) ?? [];
    const children = graph?.edges.filter(edge => edge.outV === node?.vertexId).map(edge => graph.nodes.find(item => item.vertexId === edge.inV)).filter((item): item is GraphNode => !!item && item.pending !== 'delete') ?? [];
    return <>{node ? <>
        <h2>{labelOf(node)}</h2><span className="sf-badge">{kindTitle(node.label)}</span>
        {node.vertexId === graph?.rootId && <p>根节点仅可查看和新增下级。</p>}
        <section className="sf-property-group"><h4>位置与关系</h4><dl className="sf-properties"><dt>上级位置</dt><dd>{parents.length ? parents.map(labelOf).join('、') : '根节点'}</dd><dt>{node.label === 'Agent' ? '版本数量' : '下级数量'}</dt><dd>{children.length}</dd></dl></section>
        <PropertyGroups kind={node.label} properties={node.properties} jsonFields={node.jsonFields} catalog={catalog}/>
        <details className="sf-internal-id"><summary>内部标识</summary><span>{node.vertexId}</span></details>
    </> : <p>选择节点查看资料；修改模式下右键操作。</p>}</>;
}
