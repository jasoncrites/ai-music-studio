export type IntentName =
    | 'audio.separation'
    | 'audio.generation'
    | 'medical.record.query'
    | 'compliance.check'
    | 'knowledge.query.logistics'
    | 'system.deploy'
    | 'system.heal'
    | string; // Allow dynamic intents

export interface IntentPayload {
    [key: string]: any;
}

export interface IntentResult<T = any> {
    status: 'COMPLETED' | 'FAILED' | 'PENDING';
    data: T;
    message?: string;
    kernel_metrics?: {
        latency_ms: number;
        service_id: string;
    }
}

export interface AFSOptions {
    kernelUrl?: string;
    apiKey?: string;
}
