import { IntentName, IntentPayload, IntentResult, AFSOptions } from './types';

export class AFSClient {
    private kernelUrl: string;
    private apiKey?: string;

    constructor(options: AFSOptions = {}) {
        // Default to local kernel or configurable URL
        this.kernelUrl = options.kernelUrl || process.env.AFS_KERNEL_URL || 'http://localhost:3000/api/cortex/control';
        this.apiKey = options.apiKey || process.env.AFS_API_KEY;
    }

    /**
     * Start building an intent execution.
     */
    public intent(name: IntentName) {
        return new IntentBuilder(this, name);
    }

    /**
     * Internal execution method called by builder.
     */
    async executeIntent(name: IntentName, payload: IntentPayload): Promise<IntentResult> {
        const start = Date.now();
        try {
            const res = await fetch(this.kernelUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(this.apiKey ? { 'Authorization': `Bearer ${this.apiKey}` } : {})
                },
                body: JSON.stringify({
                    action: 'EXECUTE_INTENT',
                    params: {
                        intent: name,
                        payload: payload
                    }
                })
            });

            if (!res.ok) {
                throw new Error(`Kernel Error: ${res.status} ${res.statusText}`);
            }

            const json = await res.json();

            // Unpack kernel response structure
            // Kernel returns { success: true, data: { message, data, status } }
            if (!json.success && !json.data) {
                throw new Error(json.error || 'Unknown Kernel Failure');
            }

            const kernelData = json.data || {};

            return {
                status: kernelData.status || 'COMPLETED',
                data: kernelData.data,
                message: kernelData.message,
                kernel_metrics: {
                    latency_ms: Date.now() - start,
                    service_id: 'resolved_by_kernel'
                }
            };

        } catch (e: any) {
            return {
                status: 'FAILED',
                data: null,
                message: e.message
            };
        }
    }
}

export class IntentBuilder {
    private payload: IntentPayload = {};

    constructor(private client: AFSClient, private name: IntentName) { }

    public with(data: IntentPayload) {
        this.payload = { ...this.payload, ...data };
        return this;
    }

    public async execute<T = any>(): Promise<IntentResult<T>> {
        return this.client.executeIntent(this.name, this.payload);
    }
}
