import React, { useState, useEffect } from 'react';
import { Package, Download, Settings, Trash2, Play, Pause, Upload } from 'lucide-react';
import { pluginService } from '../services/PluginService';
import { Plugin } from '../types';

export const PluginManager: React.FC = () => {
  const [plugins, setPlugins] = useState<Plugin[]>([]);
  const [isInstalling, setIsInstalling] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  useEffect(() => {
    loadPlugins();
  }, []);

  const loadPlugins = () => {
    setPlugins(pluginService.getInstalledPlugins());
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && file.name.endsWith('.wasm')) {
      setSelectedFile(file);
    }
  };

  const installPlugin = async () => {
    if (!selectedFile) return;

    setIsInstalling(true);
    try {
      const arrayBuffer = await selectedFile.arrayBuffer();
      const wasmBytes = new Uint8Array(arrayBuffer);
      
      // Mock manifest - in real implementation, this would come from a separate JSON file
      const manifest = {
        id: selectedFile.name.replace('.wasm', ''),
        name: selectedFile.name.replace('.wasm', '').replace(/-/g, ' '),
        version: '1.0.0',
        enabled: true,
        hooks: {
          onCardCreate: 'handle_card_create',
          onCardMove: 'handle_card_move'
        }
      };

      await pluginService.installPlugin(wasmBytes, manifest);
      loadPlugins();
      setSelectedFile(null);
    } catch (error) {
      console.error('Failed to install plugin:', error);
      alert(`Failed to install plugin: ${error}`);
    } finally {
      setIsInstalling(false);
    }
  };

  const togglePlugin = async (pluginId: string, enabled: boolean) => {
    try {
      if (enabled) {
        await pluginService.enablePlugin(pluginId);
      } else {
        await pluginService.disablePlugin(pluginId);
      }
      loadPlugins();
    } catch (error) {
      console.error('Failed to toggle plugin:', error);
    }
  };

  const uninstallPlugin = async (pluginId: string) => {
    if (confirm('Are you sure you want to uninstall this plugin?')) {
      try {
        await pluginService.uninstallPlugin(pluginId);
        loadPlugins();
      } catch (error) {
        console.error('Failed to uninstall plugin:', error);
      }
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-lg p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center space-x-3">
          <Package className="w-6 h-6 text-blue-600" />
          <h2 className="text-xl font-semibold text-slate-800">Plugin Manager</h2>
        </div>
        
        <div className="flex items-center space-x-3">
          <input
            type="file"
            accept=".wasm"
            onChange={handleFileSelect}
            className="hidden"
            id="plugin-file"
          />
          <label
            htmlFor="plugin-file"
            className="flex items-center space-x-2 px-3 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 cursor-pointer transition-colors"
          >
            <Upload className="w-4 h-4" />
            <span>Select WASM Plugin</span>
          </label>
          
          {selectedFile && (
            <button
              onClick={installPlugin}
              disabled={isInstalling}
              className="flex items-center space-x-2 px-3 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 disabled:opacity-50 transition-colors"
            >
              <Download className="w-4 h-4" />
              <span>{isInstalling ? 'Installing...' : 'Install'}</span>
            </button>
          )}
        </div>
      </div>

      {selectedFile && (
        <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <p className="text-sm text-blue-800">
            Selected: <strong>{selectedFile.name}</strong> ({(selectedFile.size / 1024).toFixed(1)} KB)
          </p>
        </div>
      )}

      <div className="space-y-4">
        {plugins.length === 0 ? (
          <div className="text-center py-12 text-slate-500">
            <Package className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p className="text-lg font-medium mb-2">No plugins installed</p>
            <p className="text-sm">Upload a WASM plugin to get started</p>
          </div>
        ) : (
          plugins.map((plugin) => (
            <div
              key={plugin.id}
              className="border border-slate-200 rounded-lg p-4 hover:shadow-md transition-shadow"
            >
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="flex items-center space-x-3 mb-2">
                    <h3 className="text-lg font-medium text-slate-800">
                      {plugin.name}
                    </h3>
                    <span className="text-xs bg-slate-100 text-slate-600 px-2 py-1 rounded-full">
                      v{plugin.version}
                    </span>
                    <span
                      className={`text-xs px-2 py-1 rounded-full ${
                        plugin.enabled
                          ? 'bg-green-100 text-green-700'
                          : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {plugin.enabled ? 'Enabled' : 'Disabled'}
                    </span>
                  </div>
                  
                  <div className="text-sm text-slate-600 mb-3">
                    <p><strong>ID:</strong> {plugin.id}</p>
                    <p><strong>Hooks:</strong> {Object.keys(plugin.hooks).join(', ')}</p>
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => togglePlugin(plugin.id, !plugin.enabled)}
                    className={`p-2 rounded-lg transition-colors ${
                      plugin.enabled
                        ? 'bg-amber-100 text-amber-600 hover:bg-amber-200'
                        : 'bg-green-100 text-green-600 hover:bg-green-200'
                    }`}
                    title={plugin.enabled ? 'Disable plugin' : 'Enable plugin'}
                  >
                    {plugin.enabled ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                  </button>
                  
                  <button
                    className="p-2 bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200 transition-colors"
                    title="Plugin settings"
                  >
                    <Settings className="w-4 h-4" />
                  </button>
                  
                  <button
                    onClick={() => uninstallPlugin(plugin.id)}
                    className="p-2 bg-red-100 text-red-600 rounded-lg hover:bg-red-200 transition-colors"
                    title="Uninstall plugin"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="mt-8 p-4 bg-slate-50 rounded-lg">
        <h3 className="text-sm font-medium text-slate-800 mb-2">Plugin Development</h3>
        <p className="text-xs text-slate-600 mb-3">
          Plugins are WebAssembly modules that extend KanbanLight functionality. They run in a secure sandbox
          with controlled access to the board API.
        </p>
        <div className="text-xs text-slate-500 space-y-1">
          <p><strong>Required exports:</strong> init(), execute(), malloc(), free()</p>
          <p><strong>Available hooks:</strong> onCardCreate, onCardMove, onBoardLoad</p>
          <p><strong>API access:</strong> createCard, updateCard, deleteCard, showNotification</p>
        </div>
      </div>
    </div>
  );
};