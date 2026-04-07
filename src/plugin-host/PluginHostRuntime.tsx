import { useEffect, useRef } from 'react';
import { usePluginStore } from '@/shared/state/usePluginStore';
import { useActiveWorkspace } from '@/shared/state/useWorkspaceStore';
import { createPluginContext } from './createPluginContext';
import { corePlugin } from './corePlugin';
import type { Disposable, RhythmPlugin } from './types';
import { usePluginHostStore } from './usePluginHostStore';

const localPluginModules = import.meta.glob('../../plugins/*/src/main.tsx');
const externalPluginModules = import.meta.glob('../../plugins/*/dist/main.js');

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
          entry: plugin.main || plugin.entry || undefined,
        });
        if (plugin.status !== 'enabled') {
          continue;
        }

        const candidatePaths = [
          plugin.main ? `../../plugins/${plugin.name}/${plugin.main}` : null,
          plugin.entry ? `../../plugins/${plugin.name}/${plugin.entry}` : null,
          `../../plugins/${plugin.name}/src/main.tsx`,
          `../../plugins/${plugin.name}/dist/main.js`,
        ].filter(Boolean) as string[];
        const loaderPath = candidatePaths.find((path) => localPluginModules[path] || externalPluginModules[path]);
        const loader = loaderPath ? localPluginModules[loaderPath] || externalPluginModules[loaderPath] : null;
        if (!loader) {
          host.setPluginRuntime(plugin.name, {
            status: 'load_error',
            source: (plugin.main || plugin.entry)?.startsWith('dist/') ? 'external' : 'dev',
            entry: plugin.main || plugin.entry || 'src/main.tsx',
            error: '插件入口不存在或未被 Vite dev loader 发现',
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
            entry: plugin.main || plugin.entry || loaderPath,
            trackDisposable: (disposable) => disposablesRef.current.push(disposable),
          });
          if (activated && generationRef.current === generation) {
            activePluginsRef.current.push(mod.default);
          }
        } catch (error) {
          host.setPluginRuntime(plugin.name, {
            status: 'load_error',
            source: loaderPath?.includes('/dist/') ? 'external' : 'dev',
            entry: plugin.main || plugin.entry || loaderPath,
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
