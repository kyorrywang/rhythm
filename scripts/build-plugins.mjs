import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import react from '@vitejs/plugin-react';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pluginsDir = path.join(root, 'plugins');

const plugins = readdirSync(pluginsDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .filter((name) => existsSync(path.join(pluginsDir, name, 'plugin.json')));

for (const pluginName of plugins) {
  const pluginRoot = path.join(pluginsDir, pluginName);
  const manifest = JSON.parse(readFileSync(path.join(pluginRoot, 'plugin.json'), 'utf8'));
  const sourceEntry = path.join(pluginRoot, 'src', 'main.tsx');
  if (!existsSync(sourceEntry)) {
    continue;
  }
  const outputEntry = manifest.main || 'dist/main.js';
  if (outputEntry !== 'dist/main.js') {
    console.warn(`[plugins] ${pluginName}: expected main to be "dist/main.js", got "${outputEntry}"`);
  }
  await build({
    configFile: false,
    root,
    plugins: [react()],
    resolve: {
      alias: {
        '@': path.join(root, 'src'),
      },
    },
    build: {
      emptyOutDir: true,
      outDir: path.join(pluginRoot, 'dist'),
      lib: {
        entry: sourceEntry,
        formats: ['es'],
        fileName: () => 'main.js',
      },
      rollupOptions: {
        external: ['react', 'react/jsx-runtime', 'react-dom', 'lucide-react'],
        output: {
          inlineDynamicImports: true,
        },
      },
    },
  });
}
