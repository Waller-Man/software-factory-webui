import { Fragment, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { fitPaneSizes } from './split-sizes.ts';

interface Pane {
    id: string;
    label: string;
    initial: number;
    min: number;
    collapsible?: boolean;
    children: ReactNode;
}
interface Layout { weights: Record<string, number>; collapsed: Record<string, boolean> }
interface Props { storageKey: string; className: string; panes: Pane[]; stackAt?: number }
const RAIL = 32, HANDLE = 6;
const defaults = (panes: Pane[]): Layout => ({ weights: Object.fromEntries(panes.map(p => [p.id, p.initial])), collapsed: {} });
function restore(key: string, panes: Pane[]): Layout {
    const result = defaults(panes);
    try {
        const saved = JSON.parse(localStorage.getItem('sf-layout:v1:' + key) ?? 'null');
        for (const pane of panes) {
            const weight = saved?.weights?.[pane.id];
            if (typeof weight === 'number' && Number.isFinite(weight) && weight > 0 && weight <= 1000) result.weights[pane.id] = weight;
            result.collapsed[pane.id] = !!pane.collapsible && saved?.collapsed?.[pane.id] === true;
        }
    } catch { /* Browser storage is optional; layout still works. */ }
    return result;
}

/** Panels stay mounted when folded, including the native SessionProvider. */
export function SplitLayout({ storageKey, className, panes, stackAt = 0 }: Props) {
    const [saved, setSaved] = useState(() => ({ key: storageKey, layout: restore(storageKey, panes) }));
    if (saved.key !== storageKey) setSaved({ key: storageKey, layout: restore(storageKey, panes) });
    const layout = saved.layout, root = useRef<HTMLDivElement>(null);
    const [width, setWidth] = useState(0), [dragging, setDragging] = useState(false);
    const stacked = stackAt > 0 && width > 0 && width <= stackAt;
    const drag = useRef<{ pointer: number; start: number; left: number; widths: number[] }>();
    const collapsed = (pane: Pane) => !!pane.collapsible && layout.collapsed[pane.id] === true;
    const weight = (pane: Pane) => layout.weights[pane.id] ?? pane.initial;
    const total = panes.reduce((sum, p) => sum + (collapsed(p) ? 0 : weight(p)), 0);
    const reserved = (panes.length - 1) * HANDLE + panes.filter(collapsed).length * RAIL;
    const open = panes.filter(pane => !collapsed(pane));
    const fitted = fitPaneSizes(open.map(pane => ({ weight: weight(pane), min: pane.min })), width - reserved);
    const change = (fn: (old: Layout) => Layout) => setSaved(old => ({ key: storageKey, layout: fn(old.layout) }));
    useEffect(() => {
        if (saved.key !== storageKey) return;
        try { localStorage.setItem('sf-layout:v1:' + storageKey, JSON.stringify(layout)); } catch { /* Optional preference. */ }
    }, [saved, storageKey]);
    useEffect(() => {
        const element = root.current;
        if (!element) return;
        const measure = () => setWidth(element.clientWidth);
        measure();
        if (typeof ResizeObserver === 'undefined') { window.addEventListener('resize', measure); return () => window.removeEventListener('resize', measure); }
        const observer = new ResizeObserver(measure); observer.observe(element); return () => observer.disconnect();
    }, [stackAt]);
    const widths = () => panes.map(p => root.current?.querySelector<HTMLElement>(`[data-pane="${p.id}"]`)?.getBoundingClientRect().width ?? 0);
    function resize(left: number, measured: number[], delta: number) {
        const a = panes[left], b = panes[left + 1], pair = measured[left] + measured[left + 1];
        if (pair < a.min + b.min || collapsed(a) || collapsed(b)) return;
        const next = [...measured];
        next[left] = Math.max(a.min, Math.min(pair - b.min, measured[left] + delta));
        next[left + 1] = pair - next[left];
        const sum = next.reduce((n, value, i) => n + (collapsed(panes[i]) ? 0 : value), 0);
        if (!sum) return;
        change(old => ({ ...old, weights: { ...old.weights, ...Object.fromEntries(panes.filter(p => !collapsed(p)).map(p => [p.id, next[panes.indexOf(p)] / sum * total])) } }));
    }
    function stop() { drag.current = undefined; setDragging(false); }
    return <div ref={root} className={`sf-split ${className}${stacked ? ' sf-split-stacked' : ''}${dragging ? ' sf-split-dragging' : ''}`}>
        {panes.map((pane, index) => {
            const folded = collapsed(pane);
            const disabled = stacked || folded || index === panes.length - 1 || collapsed(panes[index + 1]);
            return <Fragment key={pane.id}>
                <section className={`sf-split-pane${folded ? ' sf-pane-collapsed' : ''}`} data-pane={pane.id}
                    style={{ flex: folded ? `0 0 ${RAIL}px` : width ? `0 0 ${fitted[open.indexOf(pane)]}px` : `0 0 calc((100% - ${reserved}px) * ${weight(pane) / total})`, minWidth: folded ? RAIL : pane.min }}>
                    {pane.collapsible && <div className="sf-pane-toolbar">
                        {!folded && <strong>{pane.label}</strong>}
                        <button type="button" className="sf-pane-toggle" aria-label={`${folded ? '展开' : '折叠'}${pane.label}`} aria-expanded={!folded}
                            onClick={() => change(old => ({ ...old, collapsed: { ...old.collapsed, [pane.id]: !folded } }))}>
                            {folded ? `展开 ${pane.label}` : '折叠'}
                        </button>
                    </div>}
                    <div className="sf-pane-body" hidden={folded}>{pane.children}</div>
                </section>
                {index < panes.length - 1 && <div className="sf-split-handle" role="separator" aria-orientation="vertical" aria-label={`调整${pane.label}与${panes[index + 1].label}宽度`} aria-disabled={disabled}
                    aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(100 * weight(pane) / (weight(pane) + weight(panes[index + 1])))} tabIndex={disabled ? -1 : 0}
                    onPointerDown={e => {
                        if (disabled || e.button !== 0) return;
                        e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId);
                        drag.current = { pointer: e.pointerId, start: e.clientX, left: index, widths: widths() }; setDragging(true);
                    }}
                    onPointerMove={e => { const current = drag.current; if (current && current.pointer === e.pointerId) resize(current.left, current.widths, e.clientX - current.start); }}
                    onPointerUp={e => { if (drag.current?.pointer === e.pointerId) { stop(); e.currentTarget.releasePointerCapture(e.pointerId); } }}
                    onPointerCancel={stop} onLostPointerCapture={stop}
                    onKeyDown={e => { if (!disabled && ['ArrowLeft', 'ArrowRight'].includes(e.key)) { e.preventDefault(); resize(index, widths(), e.key === 'ArrowLeft' ? -16 : 16); } }}/>
                }
            </Fragment>;
        })}
    </div>;
}
