import { useEffect, useState } from 'react';
import type { Context } from '@deepseek-ai/cordis';
import type { ISessions, SessionReference } from '@deepseek-ai/dsh-api-session-controller/client';
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client';
import type { ConversationViewsProps } from '@deepseek-ai/dsh-client-ui-conversation/client';
import type {} from '@deepseek-ai/dsh-client-ui-session/client';
import type { SessionId } from '@deepseek-ai/dsh-session/types';
import type { PropsRenderFactories, PropsRenderSlots, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
declare module '@deepseek-ai/dsh-api-session-controller/client' {
    interface SessionReferenceSourceMap {
        softwareFactory: unknown;
    }
}
declare module '@deepseek-ai/dsh-client-ui-slots' {
    interface SlotMap {
        'softwareFactory.conversation': {
            kind: 'single';
            scope: 'session';
        };
    }
}
export const nativeChildren = { 'softwareFactory.conversation': { kind: 'single', scope: 'session' } } as const;
export type NativeHost = PropsRenderSlots<'softwareFactory.conversation'>;
/** Native views return null for a blank session. Keep a flex seat even then,
 * so the native bottom-anchored command menu has space above the composer. */
export function NativeConversationViews({ renderSlot }: ConversationViewsProps) {
    return <div className="sf-assistant-views">{renderSlot('conversation.session', {})}</div>;
}
const conversationSlots = { views: NativeConversationViews };
export function NativeConversation({ renderFactorySlot }: PropsRuntime<'softwareFactory.conversation'> & PropsRenderFactories) {
    return <div className="sf-native-conversation">{renderFactorySlot('conversation.content', { variant: 'embedded', phase: 'active', hero: false }, { slots: conversationSlots })}</div>;
}
export function AssistantPanel({ ctx, sessionId, SessionProvider, renderSlot }: NativeHost & {
    ctx: Context;
    sessionId: string;
}) {
    const [reference, setReference] = useState<SessionReference>(), [error, setError] = useState('');
    useEffect(() => {
        const sessions = ctx.get('sessions') as unknown as ISessions | undefined;
        if (!sessions) {
            setError('请启用DSH原生会话界面');
            return;
        }
        const abort = new AbortController(), ref = sessions.retain(sessionId as SessionId, { source: 'softwareFactory', signal: abort.signal });
        let active = true;
        setReference(undefined);
        setError('');
        void ref.ready.then(() => { if (active)
            setReference(ref); }).catch(() => { if (active)
            setError('原生会话未能打开，请重试'); });
        return () => { active = false; abort.abort(); ref.release(); };
    }, [ctx, sessionId]);
    if (error)
        return <p role="alert">{error}</p>;
    return <div className="sf-assistant-session">{reference ? <SessionProvider session={reference}>{renderSlot('softwareFactory.conversation', {})}</SessionProvider> : <p>正在打开原生 AI 会话…</p>}</div>;
}
