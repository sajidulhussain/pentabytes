/**
 * @fileoverview Enterprise-grade LocalStorage manager for Pentabytes OS.
 * Handles persistence, schema versioning, migration, validation, quota limits,
 * and disaster recovery for the local workspace.
 * 
 * @module StorageManager
 */

/**
 * Custom error thrown when localStorage quota is exceeded.
 */
class QuotaExceededError extends Error {
    constructor(message = 'Local storage quota exceeded.') {
        super(message);
        this.name = 'QuotaExceededError';
    }
}

/**
 * Custom error thrown when workspace import validation fails.
 */
class ValidationError extends Error {
    constructor(message = 'Data validation failed.') {
        super(message);
        this.name = 'ValidationError';
    }
}

/**
 * Manages all local storage operations for Pentabytes OS.
 */
export class StorageManager {
    #prefix = 'pb_';
    #keys = {
        schema: 'schema_version',
        settings: 'settings',
        chats: 'chats',
        projects: 'projects',
        files: 'files'
    };
    
    #currentSchemaVersion = 1;

    /**
     * Initializes the storage manager, triggering schema checks and migrations.
     */
    constructor() {
        this.#verifyStorageAvailable();
        this.#initializeSchema();
    }

    // ========================================================================
    // CORE INFRASTRUCTURE
    // ========================================================================

    /**
     * Verifies that localStorage is available and accessible.
     * @private
     * @throws {Error} If localStorage is unavailable.
     */
    #verifyStorageAvailable() {
        try {
            const testKey = `${this.#prefix}test`;
            window.localStorage.setItem(testKey, '1');
            window.localStorage.removeItem(testKey);
        } catch (e) {
            throw new Error('LocalStorage is strictly required but not available or blocked by the browser.');
        }
    }

    /**
     * Returns the full namespaced key for storage.
     * @param {string} key - The base key name.
     * @returns {string} The prefixed key.
     * @private
     */
    #getKey(key) {
        return `${this.#prefix}${key}`;
    }

    /**
     * Safely parses JSON, handling corruption by archiving the bad data.
     * @param {string} rawData - The raw JSON string from storage.
     * @param {string} key - The key associated with the data (for recovery).
     * @param {any} fallback - The fallback value if parsing fails.
     * @returns {any} The parsed object or fallback.
     * @private
     */
    #safeParse(rawData, key, fallback) {
        if (!rawData) return fallback;
        try {
            return JSON.parse(rawData);
        } catch (e) {
            console.error(`[StorageManager] Data corruption detected for key: ${key}`);
            this.#archiveCorruptedData(key, rawData);
            return fallback;
        }
    }

    /**
     * Archives corrupted data to prevent permanent data loss while resetting the active state.
     * @param {string} key - The corrupted key.
     * @param {string} rawData - The raw corrupted string.
     * @private
     */
    #archiveCorruptedData(key, rawData) {
        try {
            const timestamp = Date.now();
            window.localStorage.setItem(`${this.#prefix}corrupt_${key}_${timestamp}`, rawData);
            window.localStorage.removeItem(this.#getKey(key));
        } catch (e) {
            console.warn('[StorageManager] Failed to archive corrupted data (possible quota issue).');
        }
    }

    /**
     * Safely sets data into localStorage, catching quota exceptions.
     * @param {string} key - The base key.
     * @param {any} value - The value to store.
     * @throws {QuotaExceededError} If the browser storage limit is reached.
     * @private
     */
    #safeSet(key, value) {
        const fullKey = this.#getKey(key);
        try {
            const serialized = JSON.stringify(value);
            window.localStorage.setItem(fullKey, serialized);
        } catch (e) {
            if (this.#isQuotaError(e)) {
                throw new QuotaExceededError(`Storage quota exceeded while saving ${key}. Please clear old data.`);
            }
            throw e;
        }
    }

    /**
     * Determines if an error is a QuotaExceededError across different browsers.
     * @param {Error|any} e - The caught error.
     * @returns {boolean}
     * @private
     */
    #isQuotaError(e) {
        return (
            e instanceof DOMException &&
            (e.code === 22 || e.code === 1014 || e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED')
        );
    }

    // ========================================================================
    // SCHEMA VERSIONING & MIGRATION
    // ========================================================================

    /**
     * Initializes and migrates schema if necessary.
     * @private
     */
    #initializeSchema() {
        const storedVersion = parseInt(window.localStorage.getItem(this.#getKey(this.#keys.schema)), 10);

        if (isNaN(storedVersion)) {
            // First time setup
            this.clearWorkspace();
            window.localStorage.setItem(this.#getKey(this.#keys.schema), this.#currentSchemaVersion.toString());
            return;
        }

        if (storedVersion < this.#currentSchemaVersion) {
            this.#runMigrations(storedVersion);
        } else if (storedVersion > this.#currentSchemaVersion) {
            console.warn(`[StorageManager] Storage version (${storedVersion}) is newer than application version (${this.#currentSchemaVersion}). Downgrades are unsupported.`);
        }
    }

    /**
     * Runs sequential migrations from the stored version up to the current version.
     * @param {number} fromVersion - The currently stored schema version.
     * @private
     */
    #runMigrations(fromVersion) {
        console.info(`[StorageManager] Migrating schema from v${fromVersion} to v${this.#currentSchemaVersion}`);
        
        // Define migrations. Key is the version being migrated TO.
        const migrations = {
            // 2: () => { ... migrate v1 to v2 logic ... }
        };

        try {
            let current = fromVersion;
            while (current < this.#currentSchemaVersion) {
                const target = current + 1;
                if (migrations[target]) {
                    migrations[target]();
                }
                current = target;
            }
            window.localStorage.setItem(this.#getKey(this.#keys.schema), this.#currentSchemaVersion.toString());
        } catch (e) {
            console.error('[StorageManager] Migration failed. Halting to prevent corruption.', e);
        }
    }

    // ========================================================================
    // DOMAIN METHODS: SETTINGS
    // ========================================================================

    /**
     * Retrieves global settings.
     * @returns {Object} User settings object.
     */
    getSettings() {
        const raw = window.localStorage.getItem(this.#getKey(this.#keys.settings));
        return this.#safeParse(raw, this.#keys.settings, {
            theme: 'dark',
            telemetry: false
        });
    }

    /**
     * Updates partial settings.
     * @param {Object} newSettings - Subset of settings to update.
     */
    saveSettings(newSettings) {
        if (!newSettings || typeof newSettings !== 'object') {
            throw new ValidationError('Settings must be an object.');
        }
        const current = this.getSettings();
        const merged = { ...current, ...newSettings };
        this.#safeSet(this.#keys.settings, merged);
    }

    // ========================================================================
    // DOMAIN METHODS: CHATS
    // ========================================================================

    /**
     * Retrieves all chat threads.
     * @returns {Array<Object>} List of chat objects.
     */
    getChats() {
        const raw = window.localStorage.getItem(this.#getKey(this.#keys.chats));
        const chats = this.#safeParse(raw, this.#keys.chats, []);
        return Array.isArray(chats) ? chats : [];
    }

    /**
     * Saves or updates a chat thread.
     * @param {Object} chat - The chat object (must have an `id`).
     */
    saveChat(chat) {
        if (!chat || !chat.id) throw new ValidationError('Chat object must contain an "id" property.');
        
        const chats = this.getChats();
        const index = chats.findIndex(c => c.id === chat.id);
        
        if (index > -1) {
            chats[index] = { ...chats[index], ...chat, updatedAt: Date.now() };
        } else {
            chats.unshift({ ...chat, createdAt: Date.now(), updatedAt: Date.now() });
        }
        
        this.#safeSet(this.#keys.chats, chats);
    }

    /**
     * Deletes a chat thread by ID.
     * @param {string} id - The chat ID to remove.
     */
    deleteChat(id) {
        const chats = this.getChats().filter(c => c.id !== id);
        this.#safeSet(this.#keys.chats, chats);
    }

    // ========================================================================
    // DOMAIN METHODS: PROJECTS
    // ========================================================================

    /**
     * Retrieves all projects.
     * @returns {Array<Object>} List of project objects.
     */
    getProjects() {
        const raw = window.localStorage.getItem(this.#getKey(this.#keys.projects));
        const projects = this.#safeParse(raw, this.#keys.projects, []);
        return Array.isArray(projects) ? projects : [];
    }

    /**
     * Saves or updates a project.
     * @param {Object} project - The project object (must have an `id`).
     */
    saveProject(project) {
        if (!project || !project.id) throw new ValidationError('Project object must contain an "id" property.');
        
        const projects = this.getProjects();
        const index = projects.findIndex(p => p.id === project.id);
        
        if (index > -1) {
            projects[index] = { ...projects[index], ...project, updatedAt: Date.now() };
        } else {
            projects.unshift({ ...project, createdAt: Date.now(), updatedAt: Date.now() });
        }
        
        this.#safeSet(this.#keys.projects, projects);
    }

    /**
     * Deletes a project by ID.
     * @param {string} id - The project ID to remove.
     */
    deleteProject(id) {
        const projects = this.getProjects().filter(p => p.id !== id);
        this.#safeSet(this.#keys.projects, projects);
    }

    // ========================================================================
    // DOMAIN METHODS: FILES
    // ========================================================================

    /**
     * Retrieves file metadata list.
     * @returns {Array<Object>} List of file objects.
     */
    getFiles() {
        const raw = window.localStorage.getItem(this.#getKey(this.#keys.files));
        const files = this.#safeParse(raw, this.#keys.files, []);
        return Array.isArray(files) ? files : [];
    }

    /**
     * Saves or updates file metadata.
     * @param {Object} file - The file object (must have an `id`).
     */
    saveFile(file) {
        if (!file || !file.id) throw new ValidationError('File object must contain an "id" property.');
        
        const files = this.getFiles();
        const index = files.findIndex(f => f.id === file.id);
        
        if (index > -1) {
            files[index] = { ...files[index], ...file, updatedAt: Date.now() };
        } else {
            files.unshift({ ...file, createdAt: Date.now(), updatedAt: Date.now() });
        }
        
        this.#safeSet(this.#keys.files, files);
    }

    /**
     * Deletes file metadata by ID.
     * @param {string} id - The file ID to remove.
     */
    deleteFile(id) {
        const files = this.getFiles().filter(f => f.id !== id);
        this.#safeSet(this.#keys.files, files);
    }

    // ========================================================================
    // WORKSPACE LIFECYCLE (IMPORT/EXPORT/CLEAR)
    // ========================================================================

    /**
     * Exports the entire workspace as a serialized JSON string.
     * Includes all items prefixed with the internal namespace.
     * @returns {string} JSON representation of the workspace.
     */
    exportWorkspace() {
        const exportData = {
            exportVersion: 1,
            timestamp: Date.now(),
            data: {}
        };

        for (let i = 0; i < window.localStorage.length; i++) {
            const key = window.localStorage.key(i);
            if (key && key.startsWith(this.#prefix) && !key.startsWith(`${this.#prefix}corrupt_`)) {
                const internalKey = key.replace(this.#prefix, '');
                exportData.data[internalKey] = this.#safeParse(window.localStorage.getItem(key), internalKey, null);
            }
        }

        return JSON.stringify(exportData, null, 2);
    }

    /**
     * Imports a workspace from a JSON string, wiping current data.
     * @param {string} jsonString - The exported workspace JSON.
     * @throws {ValidationError} If the JSON is invalid or missing required structure.
     */
    importWorkspace(jsonString) {
        let parsed;
        try {
            parsed = JSON.parse(jsonString);
        } catch (e) {
            throw new ValidationError('Invalid JSON format for workspace import.');
        }

        if (!parsed || !parsed.data || typeof parsed.data !== 'object') {
            throw new ValidationError('Malformed workspace payload. Missing "data" object.');
        }

        // Validate basic integrity before nuking current state
        if (!Array.isArray(parsed.data[this.#keys.chats] || [])) {
            throw new ValidationError('Workspace payload contains invalid chats format.');
        }

        // Safe to clear and apply
        this.clearWorkspace();

        for (const [key, value] of Object.entries(parsed.data)) {
            if (value !== null && value !== undefined) {
                this.#safeSet(key, value);
            }
        }

        // Ensure schema version is set/updated post-import
        this.#initializeSchema();
    }

    /**
     * Clears all Pentabytes data from localStorage, leaving other apps' data intact.
     */
    clearWorkspace() {
        const keysToRemove = [];
        for (let i = 0; i < window.localStorage.length; i++) {
            const key = window.localStorage.key(i);
            if (key && key.startsWith(this.#prefix)) {
                keysToRemove.push(key);
            }
        }
        
        keysToRemove.forEach(key => window.localStorage.removeItem(key));
    }
}
