/**
 * @fileoverview Enterprise-grade UI and DOM Manager for Pentabytes OS.
 * Handles layout, themes, rendering, accessibility, and animations.
 * Completely decoupled from business logic, storage, and API networks.
 * 
 * @module UIManager
 */

export class UIManager {
    /**
     * Initializes the UI Manager, caching DOM nodes and binding event listeners.
     */
    constructor() {
        this.dom = {};
        this.templates = {};
        this.state = {
            isSidebarOpen: window.innerWidth > 768,
            activeModal: null
        };
        
        this.#cacheDOM();
        this.#cacheTemplates();
        this.#bindEvents();
        this.#bindShortcuts();
        this.#initializeAccessibility();
    }

    // ========================================================================
    // DOM CACHING
    // ========================================================================

    /**
     * Caches all critical DOM elements to prevent repeated querying.
     * @private
     */
    #cacheDOM() {
        this.dom = {
            app: document.getElementById('pentabytes-app'),
            sidebar: document.getElementById('primary-sidebar'),
            mainContent: document.getElementById('main-content'),
            
            // Buttons
            toggleSidebarBtn: document.getElementById('toggle-sidebar-btn'),
            closeSidebarBtn: document.getElementById('close-sidebar-btn'),
            openSettingsBtn: document.getElementById('open-settings-btn'),
            closeSettingsBtn: document.getElementById('close-modal-btn'),
            cancelSettingsBtn: document.getElementById('cancel-settings'),
            
            // Containers
            chatMessages: document.getElementById('chat-messages'),
            composerArea: document.getElementById('composer-area'),
            toastContainer: document.getElementById('toast-container'),
            notificationContainer: document.getElementById('notification-container'),
            loadingOverlay: document.getElementById('loading-overlay'),
            
            // Lists
            historyList: document.getElementById('history-list'),
            projectList: document.getElementById('project-list'),
            fileList: document.getElementById('file-list'),
            
            // Modals
            settingsModal: document.getElementById('settings-modal'),
            commandPalette: document.getElementById('command-palette'),
            
            // Inputs & Forms
            messageForm: document.getElementById('message-form'),
            promptInput: document.getElementById('prompt-input'),
            themePreference: document.getElementById('theme-preference')
        };
    }

    /**
     * Caches HTML templates for cloning.
     * @private
     */
    #cacheTemplates() {
        this.templates = {
            chatMessage: document.getElementById('template-chat-message'),
            historyItem: document.getElementById('template-history-item'),
            projectCard: document.getElementById('template-project-card'),
            fileCard: document.getElementById('template-file-card'),
            toast: document.getElementById('template-toast')
        };
    }

    // ========================================================================
    // EVENT BINDING
    // ========================================================================

    /**
     * Binds foundational UI interaction events.
     * @private
     */
    #bindEvents() {
        // Sidebar Toggles
        if (this.dom.toggleSidebarBtn) {
            this.dom.toggleSidebarBtn.addEventListener('click', () => this.toggleSidebar());
        }
        if (this.dom.closeSidebarBtn) {
            this.dom.closeSidebarBtn.addEventListener('click', () => this.closeSidebar());
        }

        // Modals
        if (this.dom.openSettingsBtn) {
            this.dom.openSettingsBtn.addEventListener('click', () => this.openModal(this.dom.settingsModal));
        }
        if (this.dom.closeSettingsBtn) {
            this.dom.closeSettingsBtn.addEventListener('click', () => this.closeModal(this.dom.settingsModal));
        }
        if (this.dom.cancelSettingsBtn) {
            this.dom.cancelSettingsBtn.addEventListener('click', () => this.closeModal(this.dom.settingsModal));
        }

        // Auto-resizing textarea
        if (this.dom.promptInput) {
            this.dom.promptInput.addEventListener('input', this.#handleTextareaResize.bind(this));
            this.dom.promptInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    if (this.dom.promptInput.value.trim()) {
                        this.dom.messageForm.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
                    }
                }
            });
        }

        // Sidebar Tabs Navigation
        const tabs = document.querySelectorAll('.tab-list [role="tab"]');
        tabs.forEach(tab => {
            tab.addEventListener('click', (e) => this.#switchTab(e.currentTarget));
            tab.addEventListener('keydown', (e) => this.#handleTabKeydown(e, tabs));
        });

        // Outside click for mobile drawer
        document.addEventListener('click', (e) => {
            if (window.innerWidth <= 768 && 
                this.state.isSidebarOpen && 
                !this.dom.sidebar.contains(e.target) && 
                !this.dom.toggleSidebarBtn.contains(e.target)) {
                this.closeSidebar();
            }
        });

        // Window resize handler for responsive sidebar
        window.addEventListener('resize', () => {
            if (window.innerWidth > 768 && !this.state.isSidebarOpen) {
                this.dom.sidebar.classList.remove('open');
                this.dom.sidebar.setAttribute('aria-hidden', 'false');
                this.state.isSidebarOpen = true;
            } else if (window.innerWidth <= 768 && this.state.isSidebarOpen) {
                this.closeSidebar();
            }
        });
    }

    /**
     * Binds global keyboard shortcuts.
     * @private
     */
    #bindShortcuts() {
        document.addEventListener('keydown', (e) => {
            // Cmd/Ctrl + K : Command Palette
            if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
                e.preventDefault();
                this.toggleCommandPalette();
            }
            
            // Escape : Close Modals / Sidebar on mobile
            if (e.key === 'Escape') {
                if (this.state.activeModal) {
                    this.closeModal(this.state.activeModal);
                } else if (window.innerWidth <= 768 && this.state.isSidebarOpen) {
                    this.closeSidebar();
                }
            }

            // Focus composer: /
            if (e.key === '/' && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
                e.preventDefault();
                this.dom.promptInput?.focus();
            }
        });
    }

    /**
     * Ensures baseline ARIA and accessibility states.
     * @private
     */
    #initializeAccessibility() {
        if (window.innerWidth <= 768) {
            this.dom.sidebar.setAttribute('aria-hidden', 'true');
            this.state.isSidebarOpen = false;
        }
    }

    // ========================================================================
    // LAYOUT & COMPONENTS
    // ========================================================================

    /**
     * Toggles the sidebar visibility.
     */
    toggleSidebar() {
        if (this.state.isSidebarOpen) {
            this.closeSidebar();
        } else {
            this.openSidebar();
        }
    }

    /**
     * Opens the sidebar/drawer.
     */
    openSidebar() {
        this.dom.sidebar.classList.add('open');
        this.dom.sidebar.setAttribute('aria-hidden', 'false');
        this.dom.toggleSidebarBtn.setAttribute('aria-expanded', 'true');
        this.state.isSidebarOpen = true;
    }

    /**
     * Closes the sidebar/drawer.
     */
    closeSidebar() {
        if (window.innerWidth <= 768) {
            this.dom.sidebar.classList.remove('open');
        }
        this.dom.sidebar.setAttribute('aria-hidden', 'true');
        this.dom.toggleSidebarBtn.setAttribute('aria-expanded', 'false');
        this.state.isSidebarOpen = false;
    }

    /**
     * Handles tab switching in the sidebar.
     * @param {HTMLElement} selectedTab The tab button element.
     * @private
     */
    #switchTab(selectedTab) {
        const tabs = selectedTab.closest('.tab-list').querySelectorAll('[role="tab"]');
        const panels = selectedTab.closest('.sidebar').querySelectorAll('[role="tabpanel"]');
        
        tabs.forEach(tab => {
            tab.setAttribute('aria-selected', 'false');
            tab.tabIndex = -1;
        });
        
        panels.forEach(panel => {
            panel.hidden = true;
            panel.classList.remove('active');
            panel.classList.add('hidden');
        });

        selectedTab.setAttribute('aria-selected', 'true');
        selectedTab.tabIndex = 0;
        
        const targetPanel = document.getElementById(selectedTab.getAttribute('aria-controls'));
        if (targetPanel) {
            targetPanel.hidden = false;
            targetPanel.classList.remove('hidden');
            targetPanel.classList.add('active');
        }
    }

    /**
     * Handles keyboard navigation for tabs.
     * @private
     */
    #handleTabKeydown(e, tabs) {
        let index = Array.from(tabs).indexOf(e.currentTarget);
        let nextIndex = null;

        if (e.key === 'ArrowRight') {
            nextIndex = (index + 1) % tabs.length;
        } else if (e.key === 'ArrowLeft') {
            nextIndex = (index - 1 + tabs.length) % tabs.length;
        }

        if (nextIndex !== null) {
            e.preventDefault();
            tabs[nextIndex].focus();
            this.#switchTab(tabs[nextIndex]);
        }
    }

    /**
     * Auto-resizes the composer textarea based on content.
     * @private
     */
    #handleTextareaResize(e) {
        const el = e.target;
        el.style.height = 'auto';
        el.style.height = Math.min(el.scrollHeight, 200) + 'px';
    }

    // ========================================================================
    // MODALS & OVERLAYS
    // ========================================================================

    /**
     * Opens an HTML dialog element.
     * @param {HTMLDialogElement} modal 
     */
    openModal(modal) {
        if (!modal) return;
        this.state.activeModal = modal;
        modal.showModal();
        document.body.style.overflow = 'hidden';
    }

    /**
     * Closes an HTML dialog element.
     * @param {HTMLDialogElement} modal 
     */
    closeModal(modal) {
        if (!modal) return;
        modal.close();
        this.state.activeModal = null;
        document.body.style.overflow = '';
    }

    /**
     * Toggles the Command Palette.
     */
    toggleCommandPalette() {
        if (this.state.activeModal === this.dom.commandPalette) {
            this.closeModal(this.dom.commandPalette);
        } else {
            this.openModal(this.dom.commandPalette);
        }
    }

    /**
     * Shows the global loading overlay.
     */
    showLoading() {
        this.dom.loadingOverlay.classList.remove('hidden');
        this.dom.loadingOverlay.setAttribute('aria-hidden', 'false');
    }

    /**
     * Hides the global loading overlay.
     */
    hideLoading() {
        this.dom.loadingOverlay.classList.add('hidden');
        this.dom.loadingOverlay.setAttribute('aria-hidden', 'true');
    }

    // ========================================================================
    // TOASTS & NOTIFICATIONS
    // ========================================================================

    /**
     * Displays a temporary toast message.
     * @param {string} message The message to display.
     * @param {number} duration Duration in ms.
     */
    showToast(message, duration = 3000) {
        if (!this.templates.toast) return;

        const clone = this.templates.toast.content.cloneNode(true);
        const toastEl = clone.querySelector('.toast-message');
        const contentEl = clone.querySelector('.toast-content');
        const closeBtn = clone.querySelector('.toast-close');

        contentEl.textContent = message;

        const removeToast = () => {
            toastEl.style.opacity = '0';
            toastEl.style.transform = 'translateY(10px)';
            setTimeout(() => toastEl.remove(), 250);
        };

        closeBtn.addEventListener('click', removeToast);
        
        this.dom.toastContainer.appendChild(toastEl);
        
        setTimeout(removeToast, duration);
    }

    // ========================================================================
    // RENDERING LOGIC
    // ========================================================================

    /**
     * Clears the chat message container.
     */
    clearChat() {
        if (this.dom.chatMessages) {
            this.dom.chatMessages.innerHTML = '';
        }
        this.hideHero();
    }

    /**
     * Hides the hero/empty state.
     */
    hideHero() {
        const hero = document.querySelector('.hero-state');
        if (hero) hero.style.display = 'none';
    }

    /**
     * Shows the hero/empty state.
     */
    showHero() {
        const hero = document.querySelector('.hero-state');
        if (hero) hero.style.display = 'flex';
    }

    /**
     * Appends a new message to the chat feed.
     * @param {string} role 'user' or 'ai'
     * @param {string|HTMLElement} content The text or DOM payload.
     * @returns {HTMLElement} The created message node.
     */
    appendMessage(role, content) {
        this.hideHero();
        if (!this.templates.chatMessage) return null;

        const clone = this.templates.chatMessage.content.cloneNode(true);
        const article = clone.querySelector('.message');
        const avatar = clone.querySelector('.message-avatar');
        const body = clone.querySelector('.message-body');

        if (role === 'user') {
            article.classList.add('user-message');
            avatar.textContent = 'G'; // Guest
        } else {
            article.classList.add('ai-message');
            // Inject Pentabytes SVG icon
            avatar.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><path d="M3 9h18M9 21V9"></path></svg>`;
            
            // Add copy/regenerate actions
            const actions = clone.querySelector('.message-actions');
            actions.innerHTML = `
                <button class="icon-btn-sm copy-btn" aria-label="Copy to clipboard">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                </button>
            `;
        }

        if (typeof content === 'string') {
            // Simple text rendering; parse markdown/formatting ideally delegated to a formatter utility
            const p = document.createElement('p');
            p.textContent = content;
            body.appendChild(p);
        } else if (content instanceof HTMLElement) {
            body.appendChild(content);
        }

        this.dom.chatMessages.appendChild(article);
        this.scrollToBottom();
        
        return article;
    }

    /**
     * Updates an existing message element (useful for streaming).
     * @param {HTMLElement} messageNode The target message node.
     * @param {string} rawChunk The chunk to append.
     */
    updateMessageStream(messageNode, rawChunk) {
        const body = messageNode.querySelector('.message-body p');
        if (body) {
            body.textContent += rawChunk;
            this.scrollToBottom();
        }
    }

    /**
     * Scrolls the chat view to the latest message.
     */
    scrollToBottom() {
        const scrollContainer = document.querySelector('.chat-scroll-container');
        if (scrollContainer) {
            const area = this.dom.chatMessages.closest('.chat-area');
            area.scrollTop = area.scrollHeight;
        }
    }

    /**
     * Clears the input composer.
     */
    clearComposer() {
        if (this.dom.promptInput) {
            this.dom.promptInput.value = '';
            this.dom.promptInput.style.height = 'auto'; // Reset resize
            this.dom.promptInput.focus();
        }
    }

    // ========================================================================
    // LIST RENDERING (Sidebar Items)
    // ========================================================================

    /**
     * Renders a list of items into a specified container.
     * @param {string} listType 'history', 'projects', or 'files'
     * @param {Array<Object>} items Data array to render.
     */
    renderSidebarList(listType, items) {
        let container, template;

        if (listType === 'history') {
            container = this.dom.historyList;
            template = this.templates.historyItem;
        } else if (listType === 'projects') {
            container = this.dom.projectList;
            template = this.templates.projectCard;
        } else if (listType === 'files') {
            container = this.dom.fileList;
            template = this.templates.fileCard;
        }

        if (!container || !template) return;

        container.innerHTML = ''; // Clear current list
        const fragment = document.createDocumentFragment();

        items.forEach(item => {
            const clone = template.content.cloneNode(true);
            const titleEl = clone.querySelector('.nav-item-title');
            titleEl.textContent = item.title || 'Untitled';
            
            if (listType === 'history') {
                const metaEl = clone.querySelector('.nav-item-meta');
                if (metaEl) {
                    const date = new Date(item.updatedAt);
                    metaEl.textContent = date.toLocaleDateString();
                }
            }

            const btn = clone.querySelector('button');
            btn.dataset.id = item.id;

            fragment.appendChild(clone);
        });

        container.appendChild(fragment);
    }

    // ========================================================================
    // THEME MANAGEMENT
    // ========================================================================

    /**
     * Applies the selected theme visually.
     * @param {string} theme 'dark' or 'system'
     */
    setTheme(theme) {
        if (theme === 'system') {
            const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
            document.documentElement.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
        } else {
            document.documentElement.setAttribute('data-theme', theme);
        }
        
        if (this.dom.themePreference) {
            this.dom.themePreference.value = theme;
        }
    }
}
