import type { FactoryConfigData } from '../../../contracts/src/gateway.ts';

export interface DatasetEntry { name?: string; local_path?: string; source_url?: string; [key: string]: unknown }
export function datasetEntries(value: unknown): DatasetEntry[] | undefined {
    if (value === undefined || value === null || value === '') return [];
    try {
        const parsed: unknown = typeof value === 'string' ? JSON.parse(value) : value;
        if (!Array.isArray(parsed) || !parsed.every(item => item && typeof item === 'object' && !Array.isArray(item) && ['name', 'local_path', 'source_url'].every(key => item[key] === undefined || typeof item[key] === 'string'))) return undefined;
        return parsed;
    } catch { return undefined; }
}
export function datasetLocation(config: FactoryConfigData | undefined, path: string): string | undefined {
    if (config?.state !== 'configured' || !path.trim()) return undefined;
    let relative: string;
    try { relative = decodeURIComponent(path.replaceAll('\\', '/')); } catch { return undefined; }
    if (/^[\/]|[:?#\u0000-\u001f\u007f\\]/.test(relative) || relative.split('/').some(part => part === '..')) return undefined;
    const root = config.datasetRoot;
    if (config.locationKind === 'local') {
        const slash = root.includes('\\') || /^[A-Za-z]:/.test(root) ? '\\' : '/';
        return root.replace(/[\\/]+$/, '') + slash + relative.replaceAll('/', slash);
    }
    try {
        const base = new URL(root); base.pathname = base.pathname.replace(/\/*$/, '/');
        const resolved = new URL(relative, base);
        return resolved.origin === base.origin && resolved.pathname.startsWith(base.pathname) ? resolved.href : undefined;
    } catch { return undefined; }
}
function sourceUrl(value: string): string | undefined {
    try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password && ![...url.searchParams.keys()].some(name => /token|signature|credential|secret|api.?key/i.test(name)) ? url.href : undefined; }
    catch { return undefined; }
}
export function DatasetRoot({ config, error }: { config?: FactoryConfigData; error?: string }) {
    return <p className="sf-dataset-root"><strong>公共数据集根位置（只读）：</strong>{error ?? (config?.state === 'configured' ? config.datasetRoot : config?.state === 'invalid' ? '配置异常，暂无法解析相对路径' : '未配置，仍可登记数据集或使用来源网址')}<small>　从数据库公共配置读取，不创建目录或下载文件。</small></p>;
}
export function DatasetValue({ value, config, error }: { value: unknown; config?: FactoryConfigData; error?: string }) {
    const entries = datasetEntries(value);
    return <div className="sf-datasets"><DatasetRoot config={config} error={error}/>{!entries ? <p role="status">数据集资料格式需要修正，原内容仍保留。</p> : entries.length === 0 ? <span className="sf-muted">未填写数据集（可选）</span> : <ul className="sf-value-list">{entries.map((entry, index) => {
        const resolved = entry.local_path ? datasetLocation(config, entry.local_path) : undefined, url = entry.source_url && sourceUrl(entry.source_url);
        return <li key={index}><strong>{entry.name || '未填写名称'}</strong><dl className="sf-properties">
            {entry.local_path && <><dt>相对路径</dt><dd>{entry.local_path}</dd><dt>解析位置</dt><dd>{resolved ?? '暂无法解析，请检查公共根位置和相对路径'}</dd></>}
            {entry.source_url && <><dt>来源网址</dt><dd>{url ? <a href={url} target="_blank" rel="noopener noreferrer">{entry.source_url}</a> : '网址格式需要修正'}</dd></>}
        </dl></li>;
    })}</ul>}</div>;
}
