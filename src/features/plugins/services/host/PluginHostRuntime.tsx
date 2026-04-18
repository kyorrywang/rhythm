import { useEffect, useRef } from 'react';
import { usePluginStore } from '@/features/plugins/store/usePluginStore';
import { useActiveWorkspace } from '@/features/workspace/store/useWorkspaceStore';
import { createPluginContext } from './createPluginContext';
import { corePlugin } from '@/features/plugins/services/core/corePlugin';
import type { Disposable, RhythmPlugin } from '../sdk/types';
import { usePluginHostStore } from './usePluginHostStore';

const localPluginModules = import.meta.glob('../../../plugins/*/src/main.tsx');
const externalPluginModules = import.meta.glob('../../../plugins/*/dist/main.js');
const useDevPluginEntry = import.meta.env.DEV;

export function PluginHostRuntime() {
  const workspace = useActiveWorkspace();
  const plugins = usePluginStore((state) => state.plugins);
  const fetchPlugins = usePluginStore((state) => state.fetchPlugins);
  const generationRef = useRef(0);
  const activePluginsRef = useRef<RhythmPlugin[]>([]);
  const disposablesRef = useRef<Disposable[]>([]);

  useEffect(() => {
    void fetchPlugins(workspace.path);
  }, [fetchPlugins, workspace.path]);

  useEffect(() => {
    const generation = generationRef.current + 1;
    generationRef.current = generation;
    const host = usePluginHostStore.getState();
    deactivateActivePlugins(activePluginsRef.current, disposablesRef.current);
    host.resetPluginHost();

    void activatePlugin('core', corePlugin, {
      source: 'core',
      trackDisposable: (disposable) => disposablesRef.current.push(disposable),
    }).then(async () => {
      if (generationRef.current === generation) {
        activePluginsRef.current.push(corePlugin);
      }
      for (const plugin of plugins) {
        if (generationRef.current !== generation) return;
        host.setPluginRuntime(plugin.name, {
          status: plugin.status === 'enabled'
            ? 'pending'
            : plugin.status === 'error'
              ? 'load_error'
              : plugin.status,
          source: 'manifest',
          entry: resolvePluginEntry(plugin),
        });
        if (plugin.status !== 'enabled') {
          continue;
        }

        const entry = resolvePluginEntry(plugin);
        const candidatePaths = entry ? [`../../../plugins/${plugin.name}/${entry}`] : [];
        const loaderPath = candidatePaths.find((path) => localPluginModules[path] || externalPluginModules[path]);
        const loader = loaderPath ? localPluginModules[loaderPath] || externalPluginModules[loaderPath] : null;
        if (!loader) {
          host.setPluginRuntime(plugin.name, {
            status: 'load_error',
            source: entry?.startsWith('dist/') ? 'external' : 'dev',
            entry,
            error: `插件入口 '${entry || '<missing>'}' 不存在或未被 Vite loader 发现`,
          });
          continue;
        }

        try {
          const mod = await loader() as { default?: RhythmPlugin };
          if (!mod.default) {
            throw new Error('插件入口没有 default export');
          }
          const activated = await activatePlugin(plugin.name, mod.default, {
            source: loaderPath?.includes('/dist/') ? 'external' : 'dev',
            entry: entry || loaderPath,
            trackDisposable: (disposable) => disposablesRef.current.push(disposable),
          });
          if (activated && generationRef.current === generation) {
            activePluginsRef.current.push(mod.default);
          }
        } catch (error) {
          host.setPluginRuntime(plugin.name, {
            status: 'load_error',
            source: loaderPath?.includes('/dist/') ? 'external' : 'dev',
            entry: entry || loaderPath,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    });

    return () => {
      generationRef.current += 1;
      deactivateActivePlugins(activePluginsRef.current, disposablesRef.current);
      usePluginHostStore.getState().resetPluginHost();
    };
  }, [plugins, workspace.path]);

  return null;
}

function resolvePluginEntry(plugin: { main?: string | null; dev_main?: string | null }) {
  if (useDevPluginEntry && plugin.dev_main) return plugin.dev_main;
  return plugin.main || undefined;
}

async function activatePlugin(
  pluginId: string,
  plugin: RhythmPlugin,
  options: { source: 'core' | 'dev' | 'external'; entry?: string; trackDisposable: (disposable: Disposable) => void },
) {
  const host = usePluginHostStore.getState();
  host.setPluginRuntime(pluginId, {
    status: 'pending',
    source: options.source,
    entry: options.entry,
  });
  try {
    await plugin.activate(createPluginContext(pluginId, options.trackDisposable));
    host.setPluginRuntime(pluginId, {
      status: 'active',
      source: options.source,
      entry: options.entry,
      error: undefined,
      activatedAt: Date.now(),
    });
    return true;
  } catch (error) {
    host.setPluginRuntime(pluginId, {
      status: 'runtime_error',
      source: options.source,
      entry: options.entry,
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

function deactivateActivePlugins(plugins: RhythmPlugin[], disposables: Disposable[]) {
  const activeDisposables = disposables.splice(0).reverse();
  for (const disposable of activeDisposables) {
    try {
      disposable.dispose();
    } catch {
      // Plugin cleanup should not prevent the host from resetting its registries.
    }
  }

  const activePlugins = plugins.splice(0).reverse();
  for (const plugin of activePlugins) {
    void Promise.resolve(plugin.deactivate?.()).catch(() => {
      // Plugin shutdown should not prevent the host from resetting its registries.
    });
  }
}


