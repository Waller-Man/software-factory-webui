/** Public embedding contract; import this entry in an orchestration Client. */
import type {} from '@deepseek-ai/dsh-client-ui-slots';

export const RUN_CARD_FACTORY = 'softwareFactory.runCard' as const;
export interface RunCardFinished {
    runId: string;
    status: 'completed' | 'failed' | 'cancelled' | 'interrupted';
    text?: string;
    /** Exactly result.files; never expanded from the full artifact index. */
    files: Array<{ artifactId: string; name: string; mime: string; size: number }>;
    error?: { stage?: string; message: string };
}
export interface RunCardProps {
    /** The session that started this Run, including an isolated execution session. */
    runtimeSessionId: string;
    runId: string;
    title?: string;
    /** Model caption captured from the native DSH catalog when execution was approved. */
    modelName?: string;
    /** Notification only. Fired once per mounted session/run, including restored terminal runs. */
    onFinished?: (result: RunCardFinished) => void;
}
declare module '@deepseek-ai/dsh-client-ui-slots' {
    interface SlotFactoryMap {
        'softwareFactory.runCard': { scope: 'root'; props: RunCardProps };
    }
}
