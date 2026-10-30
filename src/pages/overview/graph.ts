import type { GraphSnapshot, NodeView } from '../../../../contracts/src/gateway.ts';
import type { ManageDraft, NodeRef } from '../../../../contracts/src/manage.ts';
export const keyOf = (ref: NodeRef) => 'vertexId' in ref ? ref.vertexId : ref.ref;
export const refOf = (id: string): NodeRef => id.startsWith('draft:') ? { ref: id } : { vertexId: id };
export type GraphNode = NodeView & {
    pending?: 'create' | 'update' | 'delete';
};
export interface ViewGraph {
    rootId: string;
    nodes: GraphNode[];
    edges: {
        id: string;
        outV: string;
        inV: string;
        label: string;
    }[];
}
export const labelOf = (node: NodeView) => String(node.properties.name ?? node.properties.version ?? node.vertexId);
export function overlay(graph: GraphSnapshot, draft?: ManageDraft): ViewGraph {
    const nodes: GraphNode[] = graph.nodes.filter(n => n.label !== 'FieldGroup').map(node => structuredClone(node));
    const edges = graph.edges.map(e => ({ ...e }));
    for (const change of draft?.changes ?? []) {
        if (change.kind === 'create') {
            nodes.push({ vertexId: change.ref, label: change.label, detail: 'full', properties: { ...change.properties }, pending: 'create' });
            edges.push({ id: change.id, outV: keyOf(change.parent), inV: change.ref, label: change.label === 'Capability' ? 'HAS_CHILD' : change.label === 'Agent' ? 'HAS_AGENT' : 'HAS_VERSION', outVLabel: 'Capability', inVLabel: change.label });
        }
        else {
            const node = nodes.find(n => n.vertexId === keyOf(change.target));
            if (!node)
                continue;
            if (change.kind === 'delete')
                node.pending = 'delete';
            else if (change.kind === 'move-version') {
                for (let i = edges.length - 1; i >= 0; i--) if (edges[i].label === 'HAS_VERSION' && edges[i].inV === node.vertexId && edges[i].outV === change.fromParentId) edges.splice(i, 1);
                edges.push({ id: 'draft-move:' + change.id, label: 'HAS_VERSION', outV: keyOf(change.parent), inV: node.vertexId, outVLabel: 'Agent', inVLabel: 'AgentVersion' });
                node.pending ??= 'update';
            }
            else {
                Object.assign(node.properties, change.set);
                for (const field of [...Object.keys(change.set), ...change.unset]) if (node.jsonFields) delete node.jsonFields[field];
                for (const field of change.unset)
                    delete node.properties[field];
                node.pending ??= 'update';
            }
        }
    }
    return { rootId: graph.rootCapabilityId, nodes, edges };
}
export interface Filters {
    query: string;
    kind: string;
    status: string;
    model: string;
    category: string;
}
export const emptyFilters: Filters = { query: '', kind: '', status: '', model: '', category: '' };
export function filtered(graph: ViewGraph, filter: Filters): Set<string> | null {
    if (!Object.values(filter).some(Boolean))
        return null;
    const ids = new Set<string>(), byId = new Map(graph.nodes.map(n => [n.vertexId, n]));
    for (const n of graph.nodes) {
        const owner = graph.edges.find(e => e.inV === n.vertexId && e.label === 'HAS_VERSION');
        const text = `${labelOf(n)} ${n.vertexId} ${n.properties.agent_id ?? ''} ${owner ? labelOf(byId.get(owner.outV) ?? n) : ''}`.toLowerCase();
        if ((!filter.query || text.includes(filter.query.toLowerCase())) && (!filter.kind || n.label === filter.kind) && (!filter.status || n.properties.status === filter.status) && (!filter.model || String(n.properties.model_dependencies_json ?? '').toLowerCase().includes(filter.model.toLowerCase())) && (!filter.category || String(n.properties.object_categories_json ?? '').toLowerCase().includes(filter.category.toLowerCase())))
            ids.add(n.vertexId);
    }
    const queue = [...ids];
    for (let i = 0; i < queue.length; i++)
        for (const e of graph.edges)
            if (e.inV === queue[i] && !ids.has(e.outV)) {
                ids.add(e.outV);
                queue.push(e.outV);
            }
    return ids;
}
export interface TreeRow {
    key: string;
    node: GraphNode;
    depth: number;
    parent?: string;
    expandable: boolean;
    expanded: boolean;
    shared: boolean;
    x: number;
    y: number;
}
/** Path identity allows a shared leaf to remain visible under both parents. */
export function rows(graph: ViewGraph, collapsed: Set<string>, visible: Set<string> | null): TreeRow[] {
    const byId = new Map(graph.nodes.map(n => [n.vertexId, n])), result: TreeRow[] = [], seen = new Set<string>();
    const visit = (id: string, path: string[], parent?: string) => {
        const n = byId.get(id);
        if (!n || path.includes(id) || visible && !visible.has(id) || result.length >= 600)
            return;
        const key = JSON.stringify([...path, id]), children = graph.edges.filter(e => e.outV === id && (!visible || visible.has(e.inV))).map(e => e.inV);
        const row: TreeRow = { key, node: n, depth: path.length, parent, expandable: children.length > 0, expanded: !collapsed.has(key), shared: seen.has(id), x: 0, y: 0 };
        result.push(row);
        seen.add(id);
        if (row.expanded)
            for (const child of children)
                visit(child, [...path, id], key);
    };
    visit(graph.rootId, []);
    // Tidy top-down tree, same card proportions and branch spacing as the old overview.
    let leaf = 0;
    const placed = new Map<string, TreeRow>();
    for (const row of [...result].reverse()) {
        const children = result.filter(r => r.parent === row.key);
        row.x = children.length ? children.reduce((sum, r) => sum + r.x, 0) / children.length : leaf++ * 232;
        row.y = row.depth * 164;
        placed.set(row.key, row);
    }
    return result;
}
