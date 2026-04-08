import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pluginsDir = path.join(root, 'plugins');
const errors = [];

for (const entry of readdirSync(pluginsDir, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const pluginRoot = path.join(pluginsDir, entry.name);
  const manifestPath = path.join(pluginRoot, 'plugin.json');
  if (!existsSync(manifestPath)) continue;
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  validatePluginManifest(pluginRoot, manifest);
}

if (errors.length > 0) {
  for (const error of errors) console.error(error);
  process.exit(1);
}

function validatePluginManifest(pluginRoot, manifest) {
  const label = manifest.name || path.basename(pluginRoot);
  if (!manifest.name) errors.push(`${label}: missing name`);
  if (!manifest.main) errors.push(`${label}: missing main`);
  if (manifest.entry) errors.push(`${label}: legacy top-level entry is not allowed; use main`);
  if (manifest.main && manifest.main !== 'dist/main.js') {
    errors.push(`${label}: main must be exactly "dist/main.js"`);
  }
  if (manifest.main && !existsSync(path.join(pluginRoot, manifest.main))) {
    errors.push(`${label}: main does not exist: ${manifest.main}`);
  }
  if (manifest.dev?.main && manifest.dev.main !== 'src/main.tsx') {
    errors.push(`${label}: dev.main must be exactly "src/main.tsx"`);
  }
  if (manifest.dev?.main && !existsSync(path.join(pluginRoot, manifest.dev.main))) {
    errors.push(`${label}: dev.main does not exist: ${manifest.dev.main}`);
  }
  if (manifest.requires && typeof manifest.requires !== 'object') {
    errors.push(`${label}: requires must be an object`);
  }
  if (manifest.requires?.plugins && !isPlainObject(manifest.requires.plugins)) {
    errors.push(`${label}: requires.plugins must be an object`);
  }
  if (manifest.requires?.commands && !Array.isArray(manifest.requires.commands)) {
    errors.push(`${label}: requires.commands must be an array`);
  }
  if (manifest.requires?.tools && !Array.isArray(manifest.requires.tools)) {
    errors.push(`${label}: requires.tools must be an array`);
  }
  if (manifest.contributes && typeof manifest.contributes !== 'object') {
    errors.push(`${label}: contributes must be an object`);
  }

  for (const command of manifest.contributes?.commands || []) {
    if (!command.id) errors.push(`${label}: command missing id`);
    if (!command.parameters) errors.push(`${label}: command ${command.id || '<unknown>'} missing parameters`);
    if (command.tool) {
      if (command.implementation) errors.push(`${label}: tool-backed command ${command.id} must not declare implementation`);
      if (command.entry) errors.push(`${label}: tool-backed command ${command.id} must not declare entry`);
      if (command.handler) errors.push(`${label}: tool-backed command ${command.id} must not declare handler`);
    } else if (!command.implementation) {
      errors.push(`${label}: command ${command.id} must declare tool or implementation`);
    }
    if (command.implementation === 'ui') {
      if (!command.entry) errors.push(`${label}: UI command ${command.id} missing entry`);
      if (!command.handler) errors.push(`${label}: UI command ${command.id} missing handler`);
      if (command.entry && !existsSync(path.join(pluginRoot, command.entry))) {
        errors.push(`${label}: UI command ${command.id} entry does not exist: ${command.entry}`);
      }
    }
    if ((command.implementation === 'node' || command.implementation === 'python') && !command.handler) {
      errors.push(`${label}: runtime command ${command.id} missing handler`);
    }
    if ((command.implementation === 'node' || command.implementation === 'python') && command.entry && !existsSync(path.join(pluginRoot, command.entry))) {
      errors.push(`${label}: runtime command ${command.id} entry does not exist: ${command.entry}`);
    }
  }

  for (const tool of manifest.contributes?.tools || []) {
    if (!tool.id) errors.push(`${label}: tool missing id`);
    if (!tool.description) errors.push(`${label}: tool ${tool.id || '<unknown>'} missing description`);
    if (!tool.parameters) errors.push(`${label}: tool ${tool.id || '<unknown>'} missing parameters`);
    if (!tool.runtime) errors.push(`${label}: tool ${tool.id || '<unknown>'} missing runtime`);
    if (tool.runtime && tool.runtime !== 'node' && tool.runtime !== 'python') {
      errors.push(`${label}: tool ${tool.id} has unsupported runtime: ${tool.runtime}`);
    }
    if (!tool.entry) errors.push(`${label}: tool ${tool.id || '<unknown>'} missing entry`);
    if (!tool.handler) errors.push(`${label}: tool ${tool.id || '<unknown>'} missing handler`);
    if (tool.entry && !existsSync(path.join(pluginRoot, tool.entry))) {
      errors.push(`${label}: tool ${tool.id} entry does not exist: ${tool.entry}`);
    }
  }

  for (const view of manifest.contributes?.views || []) {
    if (!view.id) errors.push(`${label}: view missing id`);
    if (!view.title) errors.push(`${label}: view ${view.id || '<unknown>'} missing title`);
    if (!view.location) errors.push(`${label}: view ${view.id || '<unknown>'} missing location`);
    if (view.location && !['leftPanel', 'workbench'].includes(view.location)) {
      errors.push(`${label}: view ${view.id} has unsupported location: ${view.location}`);
    }
  }

  validatePluginSourceConventions(pluginRoot, label);
}

function validatePluginSourceConventions(pluginRoot, label) {
  const srcDir = path.join(pluginRoot, 'src');
  if (!existsSync(srcDir)) return;

  for (const file of walkFiles(srcDir)) {
    if (!/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(file)) continue;
    const relative = path.relative(pluginRoot, file);
    const source = readFileSync(file, 'utf8');

    if (source.includes('src/plugin/host') || source.includes('@/plugin/host')) {
      errors.push(`${label}: ${relative} must import from plugin/sdk, not plugin/host`);
    }

    if (source.includes('ctx.workspace')) {
      errors.push(`${label}: ${relative} uses deprecated ctx.workspace API`);
    }

    if (source.includes('ctx.shell')) {
      errors.push(`${label}: ${relative} uses deprecated ctx.shell API`);
    }
  }
}

function walkFiles(dir) {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkFiles(fullPath));
    } else {
      files.push(fullPath);
    }
  }
  return files;
}

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
