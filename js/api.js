/**
 * @fileoverview Enterprise-grade AI Provider Abstraction API.
 * Supports OpenAI, Claude, Gemini, Groq, and future providers.
 * Backend-ready, proxy-compatible, streaming, tool-calling, and vision-ready.
 * 
 * @module AIClient
 */

// ============================================================================
// ERRORS
// ============================================================================

export class AIError extends Error {
    constructor(message, status, provider, details = null) {
        super(message);
        this.name = 'AIError';
        this.status = status;
        this.provider = provider;
        this.details = details;
    }
}

export class RateLimitError extends AIError {
    constructor(provider, retryAfter) {
        super(`Rate limit exceeded for provider: ${provider}`, 429, provider);
        this.name = 'RateLimitError';
        this.retryAfter = retryAfter || 2000;
    }
}

export class TimeoutError extends AIError {
    constructor(provider) {
        super(`Request timed out for provider: ${provider}`, 408, provider);
        this.name = 'TimeoutError';
    }
}

// ============================================================================
// PROVIDER ADAPTERS (Payload formatters & response parsers)
// ============================================================================

/**
 * Base adapter for AI providers.
 */
class BaseAdapter {
    constructor(config) {
        this.baseUrl = config.baseUrl;
        this.headers = config.headers || {};
        this.providerName = 'base';
    }

    /**
     * Formats the unified request into provider-specific payload.
     * @param {Object} request Unified request object.
     * @returns {Object} Request options for fetch.
     */
    formatRequest(request) {
        throw new Error('formatRequest must be implemented by subclass');
    }

    /**
     * Parses standard JSON response.
     * @param {Object} response Provider-specific JSON response.
     * @returns {Object} Unified response object.
     */
    parseResponse(response) {
        throw new Error('parseResponse must be implemented by subclass');
    }

    /**
     * Parses a single SSE chunk for streaming.
     * @param {string} chunk Provider-specific SSE chunk.
     * @returns {string|null} Extracted text token or null.
     */
    parseStreamChunk(chunk) {
        throw new Error('parseStreamChunk must be implemented by subclass');
    }
}

/**
 * Adapter for OpenAI & OpenAI-compatible APIs (e.g., Groq).
 */
class OpenAIAdapter extends BaseAdapter {
    constructor(config) {
        super(config);
        this.providerName = config.providerName || 'openai';
    }

    formatRequest(request) {
        const payload = {
            model: request.model,
            messages: request.messages,
            temperature: request.temperature ?? 0.7,
            stream: request.stream || false,
        };

        if (request.jsonMode) {
            payload.response_format = { type: 'json_object' };
        }
        if (request.tools && request.tools.length > 0) {
            payload.tools = request.tools;
        }

        return {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...this.headers
            },
            body: JSON.stringify(payload)
        };
    }

    parseResponse(data) {
        return {
            content: data.choices[0]?.message?.content || '',
            toolCalls: data.choices[0]?.message?.tool_calls || null,
            usage: data.usage || null,
            raw: data
        };
    }

    parseStreamChunk(chunk) {
        if (chunk === '[DONE]') return null;
        try {
            const data = JSON.parse(chunk);
            return data.choices[0]?.delta?.content || null;
        } catch (e) {
            return null;
        }
    }
}

/**
 * Adapter for Anthropic / Claude.
 */
class AnthropicAdapter extends BaseAdapter {
    constructor(config) {
        super(config);
        this.providerName = 'claude';
        this.headers['anthropic-version'] = config.version || '2023-06-01';
    }

    formatRequest(request) {
        // Anthropic separates system prompt from messages
        const systemMessage = request.messages.find(m => m.role === 'system');
        const userMessages = request.messages.filter(m => m.role !== 'system');

        const payload = {
            model: request.model,
            messages: userMessages,
            max_tokens: request.maxTokens || 4096,
            temperature: request.temperature ?? 0.7,
            stream: request.stream || false,
        };

        if (systemMessage) {
            payload.system = systemMessage.content;
        }
        if (request.tools && request.tools.length > 0) {
            payload.tools = request.tools;
        }

        return {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...this.headers
            },
            body: JSON.stringify(payload)
        };
    }

    parseResponse(data) {
        const textContent = data.content?.find(c => c.type === 'text')?.text || '';
        const toolCalls = data.content?.filter(c => c.type === 'tool_use') || null;
        
        return {
            content: textContent,
            toolCalls: toolCalls,
            usage: {
                prompt_tokens: data.usage?.input_tokens,
                completion_tokens: data.usage?.output_tokens
            },
            raw: data
        };
    }

    parseStreamChunk(chunk) {
        try {
            const data = JSON.parse(chunk);
            if (data.type === 'content_block_delta' && data.delta?.type === 'text_delta') {
                return data.delta.text;
            }
            return null;
        } catch (e) {
            return null;
        }
    }
}

/**
 * Adapter for Google Gemini.
 */
class GeminiAdapter extends BaseAdapter {
    constructor(config) {
        super(config);
        this.providerName = 'gemini';
    }

    formatRequest(request) {
        // Map standard messages to Gemini contents format
        const contents = request.messages.map(m => ({
            role: m.role === 'assistant' ? 'model' : 'user',
            parts: Array.isArray(m.content) ? m.content : [{ text: m.content }]
        }));

        const payload = {
            contents,
            generationConfig: {
                temperature: request.temperature ?? 0.7,
            }
        };

        if (request.jsonMode) {
            payload.generationConfig.responseMimeType = 'application/json';
        }
        if (request.tools && request.tools.length > 0) {
            payload.tools = [{ functionDeclarations: request.tools }];
        }

        return {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...this.headers
            },
            body: JSON.stringify(payload)
        };
    }

    parseResponse(data) {
        const candidate = data.candidates?.[0];
        const parts = candidate?.content?.parts || [];
        const text = parts.map(p => p.text).join('') || '';
        const toolCalls = parts.filter(p => p.functionCall).map(p => p.functionCall) || null;

        return {
            content: text,
            toolCalls: toolCalls.length > 0 ? toolCalls : null,
            usage: data.usageMetadata || null,
            raw: data
        };
    }

    parseStreamChunk(chunk) {
        try {
            const data = JSON.parse(chunk);
            const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
            return text || null;
        } catch (e) {
            return null;
        }
    }
}

// ============================================================================
// CORE AI CLIENT
// ============================================================================

export class AIClient {
    /**
     * Initializes the AI Network Client.
     * @param {Object} config Configurations and provider definitions.
     */
    constructor(config = {}) {
        this.timeoutMs = config.timeoutMs || 30000;
        this.maxRetries = config.maxRetries || 3;
        this.providers = new Map();
        
        // Initialize configured providers securely (assumes backend proxies or secure env vars injected)
        if (config.providers) {
            for (const [name, pConfig] of Object.entries(config.providers)) {
                this.registerProvider(name, pConfig);
            }
        }
    }

    /**
     * Registers a provider dynamically.
     * @param {string} name Provider identifier.
     * @param {Object} config Provider configuration.
     */
    registerProvider(name, config) {
        let adapter;
        switch (config.type) {
            case 'openai':
                adapter = new OpenAIAdapter({ ...config, providerName: name });
                break;
            case 'claude':
                adapter = new AnthropicAdapter({ ...config, providerName: name });
                break;
            case 'gemini':
                adapter = new GeminiAdapter({ ...config, providerName: name });
                break;
            case 'groq':
                // Groq uses OpenAI SDK format
                adapter = new OpenAIAdapter({ ...config, providerName: name });
                break;
            default:
                throw new Error(`Unsupported provider type: ${config.type}`);
        }
        this.providers.set(name, adapter);
    }

    /**
     * Internal fetch with timeout and abort support.
     */
    async #fetchWithTimeout(url, options, timeoutMs, signal = null) {
        const controller = new AbortController();
        const id = setTimeout(() => controller.abort(), timeoutMs);

        // Allow external signals (like UI cancel buttons) to abort the fetch
        const onExternalAbort = () => controller.abort();
        if (signal) {
            signal.addEventListener('abort', onExternalAbort);
        }

        try {
            const response = await fetch(url, {
                ...options,
                signal: controller.signal
            });
            clearTimeout(id);
            return response;
        } catch (err) {
            clearTimeout(id);
            if (err.name === 'AbortError') {
                if (signal?.aborted) throw new Error('Request aborted by user');
                throw new TimeoutError('unknown');
            }
            throw err;
        } finally {
            if (signal) signal.removeEventListener('abort', onExternalAbort);
        }
    }

    /**
     * Executes the API request with exponential backoff and rate-limit handling.
     */
    async #executeWithRetry(adapter, requestConfig, signal) {
        let retries = 0;
        const reqOptions = adapter.formatRequest(requestConfig);

        while (retries <= this.maxRetries) {
            try {
                const response = await this.#fetchWithTimeout(adapter.baseUrl, reqOptions, this.timeoutMs, signal);
                
                if (response.ok) {
                    return { response, adapter };
                }

                if (response.status === 429) {
                    const retryAfter = response.headers.get('Retry-After');
                    const waitTime = retryAfter ? parseInt(retryAfter) * 1000 : (1000 * Math.pow(2, retries));
                    throw new RateLimitError(adapter.providerName, waitTime);
                }

                const errBody = await response.text();
                throw new AIError(`API Error: ${response.statusText}`, response.status, adapter.providerName, errBody);

            } catch (error) {
                if (error.name === 'AbortError' || error.message === 'Request aborted by user') {
                    throw error; // Never retry intentional aborts
                }

                if (retries === this.maxRetries) {
                    throw error;
                }

                const waitTime = error instanceof RateLimitError 
                    ? error.retryAfter 
                    : 1000 * Math.pow(2, retries) + Math.random() * 500; // Exponential backoff + jitter

                await new Promise(resolve => setTimeout(resolve, waitTime));
                retries++;
            }
        }
    }

    /**
     * High availability routing: Attempts primary provider, falls back to alternatives.
     */
    async #executeWithFallback(requestConfig, signal) {
        const targetProviders = requestConfig.fallbackProviders || [requestConfig.provider];
        let lastError = null;

        for (const providerName of targetProviders) {
            const adapter = this.providers.get(providerName);
            if (!adapter) continue;

            try {
                return await this.#executeWithRetry(adapter, requestConfig, signal);
            } catch (error) {
                // If it's a user abort, halt immediately. Do not fallback.
                if (error.message === 'Request aborted by user') throw error;
                lastError = error;
                console.warn(`[AIClient] Provider ${providerName} failed. Falling back...`, error.message);
            }
        }

        throw new AIError('All configured providers failed.', 500, 'system', lastError);
    }

    /**
     * Generates a standard completion.
     * @param {Object} params Request parameters.
     * @returns {Promise<Object>} Unified response object.
     */
    async complete(params) {
        const { signal, ...requestConfig } = params;
        requestConfig.stream = false;

        const { response, adapter } = await this.#executeWithFallback(requestConfig, signal);
        const data = await response.json();
        return adapter.parseResponse(data);
    }

    /**
     * Generates a streaming completion utilizing Async Generators.
     * @param {Object} params Request parameters.
     * @returns {AsyncGenerator<string, void, unknown>} Streams text tokens.
     */
    async *stream(params) {
        const { signal, ...requestConfig } = params;
        requestConfig.stream = true;

        const { response, adapter } = await this.#executeWithFallback(requestConfig, signal);
        
        if (!response.body) throw new Error('Response body is null. Streaming not supported by proxy/endpoint.');

        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let buffer = '';

        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                
                // Keep the last incomplete line in the buffer
                buffer = lines.pop(); 

                for (const line of lines) {
                    const trimmed = line.trim();
                    if (!trimmed.startsWith('data: ')) continue;
                    
                    const data = trimmed.slice(6).trim();
                    if (!data) continue;

                    const token = adapter.parseStreamChunk(data);
                    if (token) {
                        yield token;
                    }
                }
            }
        } finally {
            reader.releaseLock();
        }
    }
}
