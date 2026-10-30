import { useEffect, useMemo, useRef, useState } from 'react';
import type { MouseEvent } from 'react';
import type { TreeRow } from './graph.ts';
import { labelOf } from './graph.ts';
import { nodeBounds, fitCamera, zoomCamera, type Camera } from './viewport.ts';
export function Canvas({ rows, selected, select, selectable = () => true, toggle, menu }: {
    rows: TreeRow[];
    selected?: string;
    select: (id: string) => void;
    selectable?: (id: string) => boolean;
    toggle: (key: string) => void;
    menu: (event: MouseEvent, row: TreeRow) => void;
}) {
    const viewport = useRef<HTMLDivElement>(null), [camera, setCamera] = useState<Camera>({ x: 0, y: 0, scale: .75 });
    const fitting = useRef(true), focused = useRef<string>();
    const bounds = useMemo(() => nodeBounds(rows), [rows]);
    const drag = useRef<{
        x: number;
        y: number;
        offsetX: number;
        offsetY: number;
    }>();
    const byKey = new Map(rows.map(r => [r.key, r]));
    function fit() {
        const element = viewport.current;
        if (element && bounds && element.clientWidth > 0 && element.clientHeight > 0)
            setCamera(fitCamera(bounds, element.clientWidth, element.clientHeight));
    }
    useEffect(() => {
        const element = viewport.current;
        if (!element) return;
        const resize = () => { if (fitting.current) fit(); };
        resize();
        if (window.ResizeObserver) {
            const observer = new window.ResizeObserver(resize);
            observer.observe(element);
            return () => observer.disconnect();
        }
        window.addEventListener('resize', resize);
        return () => window.removeEventListener('resize', resize);
    }, [bounds]);
    useEffect(() => {
        if (!selected) { focused.current = undefined; return; }
        if (focused.current === selected) return;
        const element = viewport.current, row = rows.find(row => row.node.vertexId === selected);
        if (!element || !row || !element.clientWidth || !element.clientHeight) return;
        focused.current = selected;
        fitting.current = false;
        setCamera(old => ({ ...old, x: element.clientWidth / 2 - (row.x + 101) * old.scale, y: element.clientHeight / 2 - (row.y + 54) * old.scale }));
    }, [selected, rows]);
    useEffect(() => {
        const element = viewport.current;
        if (!element) return;
        // Native non-passive listener keeps wheel zoom inside this canvas only.
        const wheel = (event: WheelEvent) => {
            event.preventDefault();
            fitting.current = false;
            const rect = element.getBoundingClientRect();
            const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? element.clientHeight : 1);
            const factor = Math.exp(-Math.max(-600, Math.min(600, delta)) * .0015);
            setCamera(old => zoomCamera(old, old.scale * factor, { x: event.clientX - rect.left, y: event.clientY - rect.top }));
        };
        element.addEventListener('wheel', wheel, { passive: false });
        return () => element.removeEventListener('wheel', wheel);
    }, []);
    function zoom(factor: number) {
        const element = viewport.current;
        if (!element) return;
        fitting.current = false;
        setCamera(old => zoomCamera(old, old.scale * factor, { x: element.clientWidth / 2, y: element.clientHeight / 2 }));
    }
    return <div className="sf-canvas-wrap">
    <div className="sf-canvas" ref={viewport} onPointerDown={e => { if (e.button !== 0 || (e.target as Element).closest('.sf-node,button'))
        return; fitting.current = false; drag.current = { x: e.clientX, y: e.clientY, offsetX: camera.x, offsetY: camera.y }; e.currentTarget.setPointerCapture(e.pointerId); }} onPointerMove={e => { if (!drag.current)
        return; const next = { x: drag.current.offsetX + e.clientX - drag.current.x, y: drag.current.offsetY + e.clientY - drag.current.y }; setCamera(old => ({ ...old, ...next })); }} onPointerUp={() => { drag.current = undefined; }} onPointerCancel={() => { drag.current = undefined; }}>
    <svg width="100%" height="100%" aria-label="软件工厂能力树画布">
    <g transform={`translate(${camera.x} ${camera.y}) scale(${camera.scale})`}>
    {rows.map(r => { const p = r.parent ? byKey.get(r.parent) : undefined; return p ? <path key={`edge:${r.key}`} d={`M${p.x + 100},${p.y + 104} C${p.x + 100},${p.y + 134} ${r.x + 100},${r.y - 30} ${r.x + 100},${r.y}`} fill="none" stroke="var(--sf-line)" strokeWidth="1.5"/> : null; })}
    {rows.map(row => <foreignObject key={row.key} x={row.x} y={row.y} width="202" height="108">
        <div role="button" tabIndex={0} aria-disabled={!selectable(row.node.vertexId)} className={`sf-node ${selected === row.node.vertexId ? 'sf-selected' : ''}`} data-kind={row.node.label} data-pending={row.node.pending} onClick={() => select(row.node.vertexId)} onKeyDown={e => { if (e.key === 'Enter')
            select(row.node.vertexId); if (e.key === 'ContextMenu' || e.shiftKey && e.key === 'F10') {
            e.preventDefault();
            const rect = e.currentTarget.getBoundingClientRect();
            menu({ preventDefault() { }, clientX: rect.x + 20, clientY: rect.y + 20 } as MouseEvent, row);
        } }} onContextMenu={e => menu(e, row)}>
        <strong>{labelOf(row.node)}</strong>
        <span className="sf-badge">{row.node.label === 'Capability' ? '能力分类' : row.node.label === 'Agent' ? '逻辑 Agent' : 'Agent 版本'}</span>
        <small>{row.node.pending ? ({ create: '待新增', update: '待修改', delete: '待删除' })[row.node.pending] : row.shared ? '共享挂载' : row.node.properties.status ? String(row.node.properties.status) : ''}</small>{row.expandable && <button className="sf-toggle" aria-label={row.expanded ? '收起' : '展开'} onClick={e => { e.stopPropagation(); toggle(row.key); }}>{row.expanded ? '−' : '+'}</button>}</div>
        </foreignObject>)}
    </g>
  </svg>
    </div>
    <div className="sf-zoom">
    <button aria-label="缩小" onClick={() => zoom(1 / 1.2)}>−</button>
    <span>{camera.scale < .1 ? (camera.scale * 100).toFixed(1) : Math.round(camera.scale * 100)}%</span>
    <button aria-label="放大" onClick={() => zoom(1.2)}>+</button>
    <button onClick={() => { fitting.current = true; fit(); }}>适配</button>
    </div>
    </div>;
}
