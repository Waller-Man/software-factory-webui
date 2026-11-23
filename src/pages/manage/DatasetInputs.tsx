import { datasetEntries } from '../../shared/Datasets.tsx';
export function DatasetInputs({ value, disabled, change, blur }: { value: string; disabled: boolean; change: (text: string, clear?: boolean) => void; blur: () => void }) {
    const entries = datasetEntries(value);
    return <div className="sf-dataset-inputs" onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) blur(); }}>
        <p>可留空提交。相对路径依据数据库公共根位置，来源网址可独立填写，也可同时记录；这里只登记资料。</p>
        {!entries ? <><p role="status">原数据集格式异常，尚未覆盖。</p><button type="button" disabled={disabled} onClick={() => change('[]')}>重新填写数据集</button></> : <>
        {entries.map((entry, index) => <fieldset disabled={disabled} key={index}><legend>数据集 {index + 1}</legend>
            {(['name', 'local_path', 'source_url'] as const).map((key, field) => <label key={key}>{['数据集名称', '相对路径（可选）', '来源网址（可选）'][field]}<input aria-label={`数据集${index + 1}${['名称', '相对路径', '来源网址'][field]}`} value={entry[key] ?? ''} placeholder={['填写真实名称', '例如 requirements/sample.zip', 'https://…'][field]} onChange={event => {
                const next = entries.map((item, i) => i === index ? { ...item, [key]: event.target.value } : item);
                if (!event.target.value) delete next[index]![key];
                change(JSON.stringify(next));
            }}/></label>)}
            <button type="button" onClick={() => { const next = entries.filter((_, i) => i !== index); change(JSON.stringify(next), next.length === 0); }}>删除此数据集</button>
        </fieldset>)}
        <button type="button" disabled={disabled} onClick={() => change(JSON.stringify([...entries, { name: '' }]))}>添加数据集</button>
        </>}
    </div>;
}
