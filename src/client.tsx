import type { Context } from '@deepseek-ai/cordis';
import type {} from '@deepseek-ai/dsh-client-locale/client';
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client';
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client';
import type {} from '@deepseek-ai/dsh-api-gateway/client';
import type { MainPanelId } from '@deepseek-ai/dsh-client-ui-layout/client';
import type {} from '@deepseek-ai/dsh-client-ui-session/client';
import type { ISessions } from '@deepseek-ai/dsh-api-session-controller/client';
import type { PropsRenderFactories } from '@deepseek-ai/dsh-client-ui-slots';
import { App } from './App.tsx';
import { NativeConversation, nativeChildren } from './shared/native.tsx';
import { Api, type ManageRemote, type ReadRemote } from './shared/api.ts';
import { Controller } from './shared/controller.ts';
import { mountRuntimeCards } from './pages/runtime/integration.tsx';
import { mountSelection } from './pages/orchestration/integration.tsx';
declare module '@deepseek-ai/dsh-client-ui-slots' {
    interface LocaleNamespaceMap {
        softwareFactory: 'overview' | 'manage' | 'orchestration';
    }
    interface SlotFactoryMap {
        'softwareFactory.page': {
            scope: 'root';
            props: { page: 'overview' | 'manage' };
            inject: { controller: Controller; ctx: Context };
            locale: 'softwareFactory';
            children: typeof nativeChildren;
        };
    }
}
const panels = { overview: 'software-factory-overview' as MainPanelId, manage: 'software-factory-manage' as MainPanelId };
export const inject = ['slots', 'layout', 'locale', 'remote'];
/** Both main entries delegate to one Factory, which owns the conversation child once. */
function PageEntry({ page, renderFactorySlot }: PropsRenderFactories & { page: 'overview' | 'manage' }) {
    return renderFactorySlot('softwareFactory.page', { page });
}
function Icon() {
    return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <rect x="8" y="2" width="8" height="6" rx="1.5"/>
    <rect x="2" y="16" width="7" height="6" rx="1.5"/>
    <rect x="15" y="16" width="7" height="6" rx="1.5"/>
    <path d="M12 8v4H5.5v4M12 12h6.5v4"/>
    </svg>;
}
export function apply(ctx: Context): void {
    mountRuntimeCards(ctx);
    mountSelection(ctx);
    ctx.effect(() => ctx.locale.register('softwareFactory', { zh: { overview: '软件工厂概览', manage: '软件工厂入库', orchestration: 'Agent 编排' }, en: { overview: 'Software factory overview', manage: 'Software factory registration', orchestration: 'Agent orchestration' } }));
    ctx.effect(() => { const style = document.createElement('style'); style.dataset.plugin = 'software-factory'; style.textContent = '__SF_STYLES__'; document.head.append(style); return () => style.remove(); });
    let manage: ManageRemote | undefined;
    let gateway: ReadRemote | undefined;
    const api = new Api(() => manage, () => gateway);
    const controller = new Controller(api, page => ctx.layout.selectPanel(panels[page]), () => {
        const sessions = ctx.get('sessions') as unknown as ISessions | undefined;
        return Object.values(sessions?.list.getSnapshot().byId ?? {}).find(row => (row.retainedBy.mainView ?? 0) > 0)?.id;
    });
    ctx.slots.inject('softwareFactory.conversation', () => ctx.slots.register({ name: 'softwareFactory.conversation' }, NativeConversation));
    ctx.slots.registerFactory({ name: 'softwareFactory.page', scope: 'root', locale: 'softwareFactory', children: nativeChildren, inject: () => ({ controller, ctx }) }, App);
    for (const page of ['overview', 'manage'] as const) {
        ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: panels[page], locale: 'softwareFactory', inject: () => ({ page }) }, PageEntry));
        ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({ name: 'sidebar.panellist', id: panels[page], order: page === 'overview' ? 5 : 6, locale: 'softwareFactory', label: () => ctx.locale.bind('softwareFactory')(page) }, Icon));
    }
    ctx.effect(() => () => { controller.dispose(); if (Object.values(panels).includes(ctx.layout.panelInfo.getSnapshot().activePanelId as MainPanelId))
        ctx.layout.selectPanel(null); });
    // Remote namespaces are separate Cordis services, not plain fields on `remote`.
    // Capture each service from its injected scope; keep both pages available if absent.
    ctx.inject(['remote.hugegraphRead'], scope => {
        const service = (scope.get('remote') as unknown as { hugegraphRead: ReadRemote }).hugegraphRead;
        gateway = service;
        if (controller.getSnapshot().graph || controller.getSnapshot().error)
            void controller.load();
        scope.effect(() => () => {
            if (gateway !== service) return;
            gateway = undefined;
            controller.set({ complete: false, error: '只读 Gateway 插件未就绪，请启用后刷新；草稿已保留' });
        });
    });
    const manageUnavailable = 'Manage 插件未就绪，草稿已保留；仍可浏览概览';
    ctx.inject(['remote.sfManage'], scope => {
        const service = (scope.get('remote') as unknown as { sfManage: ManageRemote }).sfManage;
        manage = service;
        const state = controller.getSnapshot();
        if (state.notice === manageUnavailable || state.notice === 'Manage插件未启用，概览仍可浏览')
            controller.set({ notice: undefined });
        if (state.graph || state.draft || state.notice)
            void controller.refreshDrafts();
        scope.effect(() => () => {
            if (manage !== service) return;
            manage = undefined;
            api.dispose();
            controller.set({ preview: undefined, assistant: undefined, notice: manageUnavailable });
        });
    });
}
