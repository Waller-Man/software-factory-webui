/** Shared SVG camera geometry; node positions stay in graph coordinates. */
export interface Camera { x: number; y: number; scale: number }
export interface Bounds { x: number; y: number; width: number; height: number }
export function nodeBounds(nodes: readonly { x: number; y: number }[]): Bounds | undefined {
    if (!nodes.length) return;
    const x = Math.min(...nodes.map(node => node.x)), y = Math.min(...nodes.map(node => node.y));
    return { x, y, width: Math.max(...nodes.map(node => node.x + 202)) - x, height: Math.max(...nodes.map(node => node.y + 108)) - y };
}
export function fitCamera(bounds: Bounds, width: number, height: number): Camera {
    const scale = Math.min(1, Math.max(1, width - 64) / bounds.width, Math.max(1, height - 64) / bounds.height);
    return { scale, x: width / 2 - (bounds.x + bounds.width / 2) * scale, y: height / 2 - (bounds.y + bounds.height / 2) * scale };
}
export function zoomCamera(camera: Camera, scale: number, point: { x: number; y: number }): Camera {
    scale = Math.max(.001, Math.min(2, scale));
    const ratio = scale / camera.scale;
    return { scale, x: point.x - (point.x - camera.x) * ratio, y: point.y - (point.y - camera.y) * ratio };
}
