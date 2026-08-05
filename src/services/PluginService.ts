import { Plugin, Card, Board, Event } from '../types';

interface PluginContext {
  board: Board;
  user: { id: string; name: string };
  emit: (event: string, data: any) => void;
}

interface PluginAPI {
  createCard: (card: Partial<Card>) => Promise<Card>;
  updateCard: (id: string, updates: Partial<Card>) => Promise<void>;
  deleteCard: (id: string) => Promise<void>;
  getCards: () => Promise<Card[]>;
  showNotification: (message: string, type: 'info' | 'success' | 'warning' | 'error') => void;
  openModal: (component: string, props: any) => void;
  registerCommand: (id: string, title: string, handler: () => void) => void;
}

class PluginService {
  private plugins: Map<string, Plugin> = new Map();
  private loadedModules: Map<string, WebAssembly.Instance> = new Map();
  private hooks: Map<string, Function[]> = new Map();
  private commands: Map<string, { title: string; handler: () => void }> = new Map();
  private context: PluginContext | null = null;

  async initialize(context: PluginContext): Promise<void> {
    this.context = context;
    await this.loadInstalledPlugins();
  }

  private async loadInstalledPlugins(): Promise<void> {
    // Load plugins from localStorage or IndexedDB
    const savedPlugins = localStorage.getItem('kanban-plugins');
    if (savedPlugins) {
      const plugins: Plugin[] = JSON.parse(savedPlugins);
      for (const plugin of plugins) {
        if (plugin.enabled) {
          await this.loadPlugin(plugin);
        }
      }
    }
  }

  async installPlugin(wasmBytes: Uint8Array, manifest: Omit<Plugin, 'wasmModule'>): Promise<void> {
    try {
      // Compile WASM module
      const wasmModule = await WebAssembly.compile(wasmBytes);
      
      const plugin: Plugin = {
        ...manifest,
        wasmModule
      };

      // Validate plugin
      await this.validatePlugin(plugin);
      
      // Store plugin
      this.plugins.set(plugin.id, plugin);
      await this.savePlugins();
      
      if (plugin.enabled) {
        await this.loadPlugin(plugin);
      }
    } catch (error) {
      throw new Error(`Failed to install plugin: ${error}`);
    }
  }

  private async validatePlugin(plugin: Plugin): Promise<void> {
    if (!plugin.wasmModule) {
      throw new Error('Plugin must have a WASM module');
    }

    // Basic security checks
    if (!plugin.id.match(/^[a-zA-Z0-9-_]+$/)) {
      throw new Error('Plugin ID contains invalid characters');
    }

    // Check for required exports
    const moduleExports = WebAssembly.Module.exports(plugin.wasmModule);
    const requiredExports = ['init', 'execute'];
    
    for (const required of requiredExports) {
      if (!moduleExports.find(exp => exp.name === required)) {
        throw new Error(`Plugin missing required export: ${required}`);
      }
    }
  }

  private async loadPlugin(plugin: Plugin): Promise<void> {
    if (!plugin.wasmModule || !this.context) return;

    try {
      // Create plugin API
      const api = this.createPluginAPI();
      
      // Create WASM imports
      const imports = {
        env: {
          // Memory management
          memory: new WebAssembly.Memory({ initial: 1 }),
          
          // Plugin API bindings
          log: (ptr: number, len: number) => {
            const memory = new Uint8Array((imports.env.memory as WebAssembly.Memory).buffer);
            const message = new TextDecoder().decode(memory.slice(ptr, ptr + len));
            console.log(`[Plugin ${plugin.id}]:`, message);
          },
          
          create_card: async (ptr: number, len: number) => {
            const memory = new Uint8Array((imports.env.memory as WebAssembly.Memory).buffer);
            const cardData = JSON.parse(new TextDecoder().decode(memory.slice(ptr, ptr + len)));
            return await api.createCard(cardData);
          },
          
          show_notification: (ptr: number, len: number, type: number) => {
            const memory = new Uint8Array((imports.env.memory as WebAssembly.Memory).buffer);
            const message = new TextDecoder().decode(memory.slice(ptr, ptr + len));
            const types = ['info', 'success', 'warning', 'error'];
            api.showNotification(message, types[type] as any);
          }
        }
      };

      // Instantiate WASM module
      const instance = await WebAssembly.instantiate(plugin.wasmModule, imports);
      this.loadedModules.set(plugin.id, instance);

      // Initialize plugin
      if (instance.exports.init) {
        (instance.exports.init as Function)();
      }

      // Register hooks
      Object.entries(plugin.hooks).forEach(([hook, handler]) => {
        if (handler) {
          this.registerHook(hook, async (data: any) => {
            if (instance.exports.execute) {
              const encoder = new TextEncoder();
              const hookData = encoder.encode(JSON.stringify({ hook, data }));
              
              // Allocate memory in WASM
              const ptr = (instance.exports.malloc as Function)(hookData.length);
              const memory = new Uint8Array((imports.env.memory as WebAssembly.Memory).buffer);
              memory.set(hookData, ptr);
              
              // Execute plugin
              (instance.exports.execute as Function)(ptr, hookData.length);
              
              // Free memory
              (instance.exports.free as Function)(ptr);
            }
          });
        }
      });

      console.log(`Plugin ${plugin.name} loaded successfully`);
    } catch (error) {
      console.error(`Failed to load plugin ${plugin.id}:`, error);
      throw error;
    }
  }

  private createPluginAPI(): PluginAPI {
    if (!this.context) throw new Error('Plugin context not initialized');

    return {
      createCard: async (card: Partial<Card>): Promise<Card> => {
        const newCard: Card = {
          id: `card-${Date.now()}`,
          title: card.title || 'New Card',
          description: card.description || '',
          priority: card.priority || 'medium',
          assignee: card.assignee || this.context!.user.name,
          tags: card.tags || [],
          columnId: card.columnId || 'backlog',
          position: card.position || 0,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          conflicts: []
        };
        
        this.context!.emit('card-created', newCard);
        return newCard;
      },

      updateCard: async (id: string, updates: Partial<Card>): Promise<void> => {
        this.context!.emit('card-updated', { id, updates });
      },

      deleteCard: async (id: string): Promise<void> => {
        this.context!.emit('card-deleted', id);
      },

      getCards: async (): Promise<Card[]> => {
        return this.context!.board.columns.flatMap(col => col.cards);
      },

      showNotification: (message: string, type: 'info' | 'success' | 'warning' | 'error'): void => {
        this.context!.emit('notification', { message, type });
      },

      openModal: (component: string, props: any): void => {
        this.context!.emit('modal-open', { component, props });
      },

      registerCommand: (id: string, title: string, handler: () => void): void => {
        this.commands.set(id, { title, handler });
        this.context!.emit('command-registered', { id, title });
      }
    };
  }

  async enablePlugin(pluginId: string): Promise<void> {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) throw new Error(`Plugin ${pluginId} not found`);

    plugin.enabled = true;
    await this.savePlugins();
    await this.loadPlugin(plugin);
  }

  async disablePlugin(pluginId: string): Promise<void> {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) throw new Error(`Plugin ${pluginId} not found`);

    plugin.enabled = false;
    await this.savePlugins();
    
    // Unload plugin
    this.loadedModules.delete(pluginId);
    
    // Remove hooks
    this.hooks.forEach((handlers, hook) => {
      this.hooks.set(hook, handlers.filter(h => h.name !== pluginId));
    });
  }

  async uninstallPlugin(pluginId: string): Promise<void> {
    await this.disablePlugin(pluginId);
    this.plugins.delete(pluginId);
    await this.savePlugins();
  }

  getInstalledPlugins(): Plugin[] {
    return Array.from(this.plugins.values());
  }

  getCommands(): Map<string, { title: string; handler: () => void }> {
    return this.commands;
  }

  // Hook system
  registerHook(hook: string, handler: Function): void {
    if (!this.hooks.has(hook)) {
      this.hooks.set(hook, []);
    }
    this.hooks.get(hook)!.push(handler);
  }

  async executeHook(hook: string, data: any): Promise<any[]> {
    const handlers = this.hooks.get(hook) || [];
    const results = await Promise.allSettled(
      handlers.map(handler => handler(data))
    );
    
    return results
      .filter(result => result.status === 'fulfilled')
      .map(result => (result as PromiseFulfilledResult<any>).value);
  }

  private async savePlugins(): Promise<void> {
    const plugins = Array.from(this.plugins.values()).map(plugin => ({
      ...plugin,
      wasmModule: undefined // Don't serialize WASM module
    }));
    localStorage.setItem('kanban-plugins', JSON.stringify(plugins));
  }

  // Security sandbox
  private createSandbox(): any {
    return {
      // Restricted global object
      console: {
        log: (...args: any[]) => console.log('[Plugin]', ...args),
        warn: (...args: any[]) => console.warn('[Plugin]', ...args),
        error: (...args: any[]) => console.error('[Plugin]', ...args)
      },
      
      // No access to DOM, fetch, etc.
      window: undefined,
      document: undefined,
      fetch: undefined,
      XMLHttpRequest: undefined
    };
  }
}

export const pluginService = new PluginService();