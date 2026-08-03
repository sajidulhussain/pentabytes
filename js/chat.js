/**
 * @fileoverview Enterprise-grade Conversation Manager for Pentabytes OS.
 * Manages conversational state, streaming logic, message templating, and text parsing 
 * (Markdown/Syntax Highlighting). Strictly decoupled from API and DOM/UI implementations.
 * 
 * @module ChatManager
 */

// ============================================================================
// UTILITIES (Markdown & Syntax Highlighting)
// ============================================================================

/**
 * Lightweight, zero-dependency Markdown & Syntax Highlighting Engine.
 */
class TextProcessor {
    /**
     * Escapes HTML entities to prevent XSS.
     * @param {string} str Raw text.
     * @returns {string} Escaped text.
     */
    static escapeHTML(str) {
        return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    /**
     * Applies basic syntax highlighting to a code block.
     * @param {string} code The source code.
     * @param {string} lang The language identifier.
     * @returns {string} HTML with span tags for styling.
     */
    static highlight(code, lang) {
        const escaped = this.escapeHTML(code);
        // Extremely basic keyword matching for demonstration of no-dependency highlighting.
        // In a real production environment, this would interface with Prism.js or Highlight.js.
        const keywords = /\b(const|let|var|function|return|if|else|for|while|class|import|export|await|async|new|this)\b/g;
        const strings = /(&quot;.*?&quot;|&#039;.*?&#039;|`.*?`)/g;
        
        let highlighted = escaped
            .replace(strings, '<span class="token string">$1</span>')
            .replace(keywords, '<span class="token keyword">$1</span>');

        return `<pre><code class="language-${this.escapeHTML(lang || 'text')}">${highlighted}</code></pre>`;
    }

    /**
     * Parses standard Markdown into HTML.
     * @param {string} text Markdown string.
     * @returns {string} Rendered HTML.
     */
    static renderMarkdown(text) {
        if (!text) return '';

        // Extract code blocks first to prevent formatting inside them
        const codeBlocks = [];
        let parsed = text.replace(/```([\w-]+)?\n([\s\S]*?)```/g, (match, lang, code) => {
            const placeholder = `__CODE_BLOCK_${codeBlocks.length}__`;
            codeBlocks.push(this.highlight(code.trim(), lang));
            return placeholder;
        });

        // Parse Inline Formatting
        parsed = this.escapeHTML(parsed)
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')       // Bold
            .replace(/\*(.*?)\*/g, '<em>$1</em>')                   // Italic
            .replace(/`(.*?)`/g, '<code>$1</code>')                 // Inline code
            .replace(/\n/g, '<br>');                                // Line breaks

        // Re-inject code blocks
        codeBlocks.forEach((block, index) => {
            parsed = parsed.replace(`__CODE_BLOCK_${index}__`, block);
        });

        return parsed;
    }
}

// ============================================================================
// CORE CHAT MANAGER
// ============================================================================

export class ChatManager {
    /**
     * Initializes a new Chat Session instance.
     * @param {Object} config Dependencies and callback hooks.
     */
    constructor(config = {}) {
        this.chatId = config.chatId || this.#generateId();
        this.title = config.title || 'New Conversation';
        this.messages = [];
        
        this.isGenerating = false;
        this.abortController = null;
        this.typingAnimationInterval = null;

        // Callback bindings (Decouples state from UI/Network)
        this.onMessageAdded = config.onMessageAdded || (() => {});
        this.onMessageUpdated = config.onMessageUpdated || (() => {});
        this.onMessageRemoved = config.onMessageRemoved || (() => {});
        this.onChatRenamed = config.onChatRenamed || (() => {});
        this.onChatDeleted = config.onChatDeleted || (() => {});
        this.onStateChange = config.onStateChange || (() => {});
        this.onScrollRequired = config.onScrollRequired || (() => {});
        this.onRequestGeneration = config.onRequestGeneration || (async () => {});
        this.onTypingStateChange = config.onTypingStateChange || (() => {});
        this.onNotification = config.onNotification || (() => {});

        if (config.initialMessages) {
            this.loadHistory(config.initialMessages);
        }
    }

    // ========================================================================
    // STATE MANAGEMENT
    // ========================================================================

    /**
     * Generates a unique identifier.
     * @private
     * @returns {string} UUID.
     */
    #generateId() {
        return typeof crypto !== 'undefined' && crypto.randomUUID 
            ? crypto.randomUUID() 
            : `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Loads existing message history into the current session.
     * @param {Array<Object>} history Array of message objects.
     */
    loadHistory(history) {
        this.messages = history.map(msg => ({
            ...msg,
            html: TextProcessor.renderMarkdown(msg.content)
        }));
        this.onStateChange(this.getState());
    }

    /**
     * Returns a snapshot of the current conversation state.
     * @returns {Object} Clean state object suitable for storage.
     */
    getState() {
        return {
            id: this.chatId,
            title: this.title,
            updatedAt: Date.now(),
            messages: this.messages.map(m => ({
                id: m.id,
                role: m.role,
                content: m.content,
                timestamp: m.timestamp
            }))
        };
    }

    // ========================================================================
    // MESSAGE OPERATIONS
    // ========================================================================

    /**
     * Creates and appends a new message.
     * @param {string} role 'user', 'assistant', or 'system'.
     * @param {string} content Raw text content.
     * @returns {Object} The created message.
     */
    addMessage(role, content) {
        const message = {
            id: this.#generateId(),
            role,
            content,
            html: TextProcessor.renderMarkdown(content),
            timestamp: Date.now()
        };

        this.messages.push(message);
        this.onMessageAdded(message);
        this.onScrollRequired();
        this.onStateChange(this.getState());

        return message;
    }

    /**
     * Pre-defined template for system messages (e.g., Context setting, Instructions).
     * @param {string} instruction The system instruction.
     */
    addSystemTemplate(instruction) {
        const formatted = `> **System Context:** ${instruction}`;
        this.addMessage('system', formatted);
    }

    /**
     * Replaces an existing message and truncates the conversation history from that point.
     * Used for editing prompts.
     * @param {string} messageId ID of the message to edit.
     * @param {string} newContent The updated content.
     */
    async editPrompt(messageId, newContent) {
        if (this.isGenerating) this.stopGeneration();

        const index = this.messages.findIndex(m => m.id === messageId);
        if (index === -1) return;

        // Ensure we are only editing user prompts in this context
        if (this.messages[index].role !== 'user') {
            this.onNotification('Only user messages can be edited.', 'error');
            return;
        }

        // Truncate history
        const removed = this.messages.splice(index);
        removed.forEach(m => this.onMessageRemoved(m.id));

        // Add new message and trigger generation
        this.addMessage('user', newContent);
        await this.#triggerGeneration();
    }

    /**
     * Discards the latest AI response and regenerates it based on prior context.
     * @param {string} [messageId] Optional specific AI message to regenerate. Defaults to last.
     */
    async regenerate(messageId = null) {
        if (this.isGenerating) this.stopGeneration();

        let index = this.messages.length - 1;
        if (messageId) {
            index = this.messages.findIndex(m => m.id === messageId);
        }

        // Must target an assistant message
        if (index > 0 && this.messages[index].role === 'assistant') {
            // Remove the targeted response
            const removed = this.messages.splice(index);
            removed.forEach(m => this.onMessageRemoved(m.id));
            await this.#triggerGeneration();
        } else {
            this.onNotification('Invalid regeneration target.', 'error');
        }
    }

    /**
     * Copies the content of a specific message to the system clipboard.
     * @param {string} messageId ID of the message.
     */
    async copyMessage(messageId) {
        const msg = this.messages.find(m => m.id === messageId);
        if (!msg) return;

        try {
            await navigator.clipboard.writeText(msg.content);
            this.onNotification('Message copied to clipboard.', 'success');
        } catch (err) {
            this.onNotification('Failed to copy message.', 'error');
        }
    }

    // ========================================================================
    // STREAMING & GENERATION LIFECYCLE
    // ========================================================================

    /**
     * Initiates the generation pipeline.
     * @private
     */
    async #triggerGeneration() {
        this.isGenerating = true;
        this.abortController = new AbortController();
        this.#startTypingAnimation();

        // Create empty placeholder message for the AI response
        const aiMessage = {
            id: this.#generateId(),
            role: 'assistant',
            content: '',
            html: '',
            timestamp: Date.now()
        };
        
        this.messages.push(aiMessage);
        this.onMessageAdded(aiMessage);

        try {
            // Hand off the network logic to the external provider
            await this.onRequestGeneration(
                this.messages.slice(0, -1), // Send history minus empty placeholder
                this.abortController.signal,
                (chunk) => this.streamChunk(aiMessage.id, chunk)
            );
        } catch (error) {
            if (error.name === 'AbortError' || error.message.includes('aborted')) {
                this.appendSystemError(aiMessage.id, '\n\n*[Generation Stopped by User]*');
            } else {
                this.appendSystemError(aiMessage.id, `\n\n**Error:** ${error.message}`);
            }
        } finally {
            this.isGenerating = false;
            this.#stopTypingAnimation();
            this.onStateChange(this.getState());
        }
    }

    /**
     * Appends a text chunk to a specific message and triggers a re-render.
     * @param {string} messageId ID of the message being streamed.
     * @param {string} chunk Text fragment.
     */
    streamChunk(messageId, chunk) {
        if (!chunk) return;
        
        const index = this.messages.findIndex(m => m.id === messageId);
        if (index === -1) return;

        // Hide typing indicator on first valid chunk
        if (this.messages[index].content === '') {
            this.#stopTypingAnimation();
        }

        this.messages[index].content += chunk;
        this.messages[index].html = TextProcessor.renderMarkdown(this.messages[index].content);
        
        this.onMessageUpdated(this.messages[index]);
        this.onScrollRequired();
    }

    /**
     * Appends an error or system notice to an actively generating message.
     * @param {string} messageId ID of the message.
     * @param {string} errorMessage Markdown formatted error text.
     */
    appendSystemError(messageId, errorMessage) {
        this.streamChunk(messageId, errorMessage);
    }

    /**
     * Halts any ongoing text generation.
     */
    stopGeneration() {
        if (this.isGenerating && this.abortController) {
            this.abortController.abort();
            this.isGenerating = false;
            this.#stopTypingAnimation();
            this.onNotification('Generation stopped.', 'info');
        }
    }

    // ========================================================================
    // ANIMATIONS & UX
    // ========================================================================

    /**
     * Starts the synthetic typing indicator.
     * @private
     */
    #startTypingAnimation() {
        this.onTypingStateChange(true);
        // Additional pure JS timer-based animation logic can go here if needed,
        // but state offloading is preferred.
    }

    /**
     * Stops the synthetic typing indicator.
     * @private
     */
    #stopTypingAnimation() {
        this.onTypingStateChange(false);
    }

    // ========================================================================
    // METADATA OPERATIONS
    // ========================================================================

    /**
     * Renames the current chat session.
     * @param {string} newTitle 
     */
    rename(newTitle) {
        const title = newTitle.trim() || 'Untitled Chat';
        this.title = title;
        this.onChatRenamed(this.chatId, title);
        this.onStateChange(this.getState());
    }

    /**
     * Tears down the conversation and triggers deletion callbacks.
     */
    destroy() {
        this.stopGeneration();
        this.messages = [];
        this.onChatDeleted(this.chatId);
    }
}
