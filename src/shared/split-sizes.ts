/** Distribute the available width by preference, reserving each pane's minimum. */
export function fitPaneSizes(panes: readonly { weight: number; min: number }[], available: number): number[] {
    const sizes = panes.map(() => 0), pending = new Set(panes.map((_, i) => i));
    let remaining = Math.max(available, panes.reduce((sum, pane) => sum + pane.min, 0));
    while (pending.size) {
        const sum = [...pending].reduce((value, i) => value + panes[i].weight, 0);
        const tooSmall = [...pending].filter(i => remaining * panes[i].weight / sum < panes[i].min);
        if (!tooSmall.length) {
            for (const i of pending) sizes[i] = remaining * panes[i].weight / sum;
            break;
        }
        for (const i of tooSmall) { sizes[i] = panes[i].min; remaining -= sizes[i]; pending.delete(i); }
    }
    return sizes;
}
