import { Plugin, Card, Board } from '../types';
import { databaseService } from './DatabaseService';

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
    try {
      const storedPlugins = await databaseService.getAllPlugins();
      for (const stored of storedPlugins) {
        let wasmModule: WebAssembly.Module | undefined;
        if (stored.wasmBytes) {
          try {
            wasmModule = await WebAssembly.compile(stored.wasmBytes as BufferSource);
          } catch (e) {
            console.error(`Failed to compile WASM module for plugin ${stored.id}:`, e);
          }
        }

        const plugin: Plugin = {
          id: stored.id,
          name: stored.name,
          version: stored.version,
          enabled: stored.enabled,
          hooks: stored.hooks,
          wasmBytes: stored.wasmBytes,
          wasmModule
        };

        this.plugins.set(plugin.id, plugin);

        if (plugin.enabled && wasmModule) {
          await this.loadPlugin(plugin);
        }
      }
    } catch (error) {
      console.error('Failed to load installed plugins from DatabaseService:', error);
    }
  }

  async installPlugin(wasmBytes: Uint8Array, manifest: Omit<Plugin, 'wasmModule'>): Promise<void> {
    try {
      // Compile WASM module
      const wasmModule = await WebAssembly.compile(wasmBytes);

      const plugin: Plugin = {
        ...manifest,
        wasmBytes,
        wasmModule
      };

      // Validate plugin
      await this.validatePlugin(plugin);

      // Store plugin in memory map
      this.plugins.set(plugin.id, plugin);

      // Persist plugin metadata + binary bytes in IndexedDB
      await databaseService.savePlugin({
        id: plugin.id,
        name: plugin.name,
        version: plugin.version,
        enabled: plugin.enabled,
        hooks: plugin.hooks,
        wasmBytes
      });

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

    if (!plugin.id.match(/^[a-zA-Z0-9-_]+$/)) {
      throw new Error('Plugin ID contains invalid characters');
    }

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
      const api = this.createPluginAPI();

      const imports = {
        env: {
          memory: new WebAssembly.Memory({ initial: 1 }),

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

      const instance = await WebAssembly.instantiate(plugin.wasmModule, imports);
      this.loadedModules.set(plugin.id, instance);

      if (instance.exports.init) {
        (instance.exports.init as Function)();
      }

      Object.entries(plugin.hooks).forEach(([hook, handler]) => {
        if (handler) {
          this.registerHook(hook, async (data: any) => {
            if (instance.exports.execute) {
              const encoder = new TextEncoder();
              const hookData = encoder.encode(JSON.stringify({ hook, data }));

              const ptr = (instance.exports.malloc as Function)(hookData.length);
              const memory = new Uint8Array((imports.env.memory as WebAssembly.Memory).buffer);
              memory.set(hookData, ptr);

              (instance.exports.execute as Function)(ptr, hookData.length);
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
    await databaseService.savePlugin({
      id: plugin.id,
      name: plugin.name,
      version: plugin.version,
      enabled: true,
      hooks: plugin.hooks,
      wasmBytes: plugin.wasmBytes
    });

    if (!plugin.wasmModule && plugin.wasmBytes) {
      plugin.wasmModule = await WebAssembly.compile(plugin.wasmBytes as BufferSource);
    }

    if (plugin.wasmModule) {
      await this.loadPlugin(plugin);
    }
  }

  async disablePlugin(pluginId: string): Promise<void> {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) throw new Error(`Plugin ${pluginId} not found`);

    plugin.enabled = false;
    await databaseService.savePlugin({
      id: plugin.id,
      name: plugin.name,
      version: plugin.version,
      enabled: false,
      hooks: plugin.hooks,
      wasmBytes: plugin.wasmBytes
    });

    this.loadedModules.delete(pluginId);
    this.hooks.forEach((handlers, hook) => {
      this.hooks.set(hook, handlers.filter(h => h.name !== pluginId));
    });
  }

  async uninstallPlugin(pluginId: string): Promise<void> {
    await this.disablePlugin(pluginId);
    this.plugins.delete(pluginId);
    await databaseService.deletePlugin(pluginId);
  }

  getInstalledPlugins(): Plugin[] {
    return Array.from(this.plugins.values());
  }

  getCommands(): Map<string, { title: string; handler: () => void }> {
    return this.commands;
  }

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
}

export const pluginService = new PluginService();