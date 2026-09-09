import assert from 'node:assert/strict';
import { mkdir, readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { sha256 } from './capture-extension.mjs';

// Deliberately allowlist diagnostics: SDK messages may embed credentials, headers or private requests.
export function summarizeFailure(error, stage) {
  const stopReason = ['error', 'aborted'].includes(error?.stopReason) ? error.stopReason : undefined;
  const code = ['ERR_ASSERTION', 'ETIMEDOUT', 'ECONNRESET', 'ECONNREFUSED', 'ENOENT', 'EACCES', 'ENOSPC'].includes(error?.code) ? error.code : undefined;
  const status = error?.status ?? Number(/^[45]\d\d\b/.exec(error?.errorMessage ?? error?.message ?? '')?.[0]);
  const httpStatus = Number.isInteger(status) && status >= 400 && status <= 599 ? status : undefined;
  const category = stopReason === 'aborted' || error?.name === 'AbortError' ? 'cancelled' :
    error?.name === 'TimeoutError' || code === 'ETIMEDOUT' ? 'timeout' : httpStatus ? 'provider-error' :
    code === 'ERR_ASSERTION' ? 'assertion' : stopReason === 'error' ? 'assistant-error' : 'runtime-error';
  return { stage, category, diagnostic: httpStatus ? `provider HTTP ${httpStatus}` : code ?? category,
    ...(stopReason ? { stopReason } : {}), ...(httpStatus ? { status: httpStatus } : {}), ...(code ? { code } : {}) };
}

export async function loadInstalledRuntime({ runtimeDist, pluginPath }) {
  assert(runtimeDist && pluginPath, 'unresolved: explicit runtimeDist and pluginPath required');
  runtimeDist = await realpath(runtimeDist);
  pluginPath = await realpath(pluginPath);
  const sdkPath = path.join(runtimeDist, 'index.js');
  const sdk = await import(pathToFileURL(sdkPath));
  for (const name of ['createAgentSession', 'createAgentSessionServices', 'DefaultResourceLoader', 'SessionManager', 'SettingsManager', 'ModelRegistry']) {
    assert.equal(typeof sdk[name], 'function', `unresolved: installed SDK lacks ${name}`);
  }
  const manifest = JSON.parse(await readFile(path.join(pluginPath, 'package.json'), 'utf8'));
  assert(manifest.pi?.extensions?.length, 'unresolved: supplied package has no public extension chain');
  const extensionPaths = manifest.pi.extensions.map(file => path.resolve(pluginPath, file));
  const identity = { version: sdk.VERSION, runtimeDist, pluginPath, sdkSha256: sha256(await readFile(sdkPath)),
    pluginSha256: sha256(Buffer.concat(await Promise.all(extensionPaths.map(file => readFile(file))))) };
  return { sdk, extensionPaths, identity };
}

export async function createIsolatedAuthStorage({ runtime, cwd, agentDir, credentials = {} }) {
  assert(path.isAbsolute(cwd) && path.isAbsolute(agentDir), 'explicit isolated auth directories required');
  await mkdir(agentDir, { recursive: true, mode: 0o700 });
  // AuthStorage is deliberately not a package export. Obtain it from the public services factory.
  const services = await runtime.sdk.createAgentSessionServices({ cwd, agentDir,
    settingsManager: runtime.sdk.SettingsManager.inMemory({ enabledBuiltinExtensions: [], packages: [], extensions: [],
      hooks: [], enableAnalytics: false, enableInstallTelemetry: false }),
    resourceLoaderOptions: { noExtensions: true, noSkills: true, noPromptTemplates: true, noThemes: true, noContextFiles: true } });
  assert.deepEqual(services.diagnostics, [], 'unresolved: isolated auth services diagnostics');
  assert.deepEqual(services.resourceLoader.getExtensions().extensions, [], 'auth bootstrap must not load extensions');
  assert.deepEqual(services.resourceLoader.getExtensions().errors, [], 'unresolved: auth resource load errors');
  for (const [provider, credential] of Object.entries(credentials)) services.authStorage.set(provider, credential);
  return services.authStorage;
}

export async function createCapturedSession({ runtime, cwd, agentDir, model, authStorage, settings = {},
  sessionManager, capture, tools = ['read'], customTools = [], skillPaths = [], thinkingLevel = 'off', extensionFactories = [] }) {
  assert(model && authStorage && capture && path.isAbsolute(cwd) && path.isAbsolute(agentDir), 'explicit isolated session inputs required');
  const { sdk } = runtime;
  const settingsManager = sdk.SettingsManager.inMemory({ ...settings, packages: [], extensions: [], hooks: [],
    enableAnalytics: false, enableInstallTelemetry: false, enableSkillCommands: true,
    promptCache: { ...settings.promptCache, keepAlive: { enabled: false } },
    retry: { enabled: false, maxRetries: 0, modelFallback: false, provider: { maxRetries: 0 } },
    compaction: { ...settings.compaction, enabled: false, speculativeEnabled: false, idleCompactionEnabled: false } });
  const loader = new sdk.DefaultResourceLoader({ cwd, agentDir, settingsManager,
    additionalExtensionPaths: runtime.extensionPaths, additionalSkillPaths: skillPaths,
    noExtensions: true, noSkills: true, noPromptTemplates: true, noThemes: true, noContextFiles: true,
    extensionFactories: [{ name: 'skill-loading-capture', factory: capture.extension }, ...extensionFactories],
    extensionsOverride(base) {
      const index = base.extensions.findIndex(extension => extension.path === '<inline:skill-loading-capture>');
      assert(index >= 0, 'unresolved: capture extension not loaded');
      base.extensions.push(...base.extensions.splice(index, 1));
      return base;
    },
  });
  await loader.reload();
  assert.deepEqual(loader.getExtensions().errors, [], 'unresolved: extension load errors');
  const modelRegistry = sdk.ModelRegistry.inMemory(authStorage);
  if (model.provider === 'skill-loading-offline') {
    modelRegistry.registerProvider(model.provider, { baseUrl: model.baseUrl, api: model.api, models: [model] });
  }
  const result = await sdk.createAgentSession({ cwd, agentDir, resourceLoader: loader, settingsManager,
    modelRegistry, authStorage, model, thinkingLevel, tools, customTools, autoTitleSessions: false,
    scopedModels: [], favoriteModels: [], sessionManager: sessionManager ?? sdk.SessionManager.inMemory(cwd) });
  const { session } = result;
  const receipt = { version: 1, runtime: runtime.identity,
    model: { provider: model.provider, id: model.id, api: model.api, thinkingLevel },
    safeguards: { autoTitleSessions: false, retry: false, modelFallback: false, autoCompaction: false, cacheKeepAlive: false, activeTools: [...tools] },
    extensions: loader.getExtensions().extensions.map(extension => ({ path: extension.path, events: [...extension.handlers.keys()] })),
    requests: capture.requests, reads: capture.reads, events: capture.events, diagnostics: [], settled: 0,
    usage: { unavailable: 'AgentSession exposes normalized usage, not original provider usage fields' } };
  let closed = false;
  const unsubscribe = session.subscribe(event => {
    if (event.type === 'agent_settled') receipt.settled++;
    if (event.type === 'skill_invocation') capture.events.push({ sequence: capture.events.length + 1, type: event.type });
    if (event.type === 'message_end' && event.message.role === 'assistant' && event.message.usage) receipt.normalizedUsage = event.message.usage;
  });
  try {
    await session.bindExtensions({ onError: error => {
      // The installed SDK emits this successful dedup notice through its error channel.
      if (error.event === 'skill_expansion' && /^Skipped duplicate skill invocation: [a-z0-9-]+$/.test(error.error)) {
        receipt.diagnostics.push({ code: 'duplicate-skill-invocation', event: error.event });
      } else capture.errors.push(`extension error: ${error.event ?? 'unknown'}`);
    } });
    assert.deepEqual(session.getActiveToolNames().sort(), [...tools].sort(), 'unexpected active tools');
  } catch (error) {
    unsubscribe(); session.dispose(); throw error;
  }
  return { session, loader, receipt,
    async prompt(text, { timeoutMs = 30000 } = {}) {
      let off, timer;
      const settled = new Promise((resolve, reject) => {
        off = session.subscribe(event => { if (event.type === 'agent_settled') resolve(); });
        timer = setTimeout(() => reject(Object.assign(new Error('agent_settled timeout'), { code: 'ETIMEDOUT' })), timeoutMs);
      });
      try {
        await Promise.all([settled, session.prompt(text)]);
        const last = session.messages.filter(message => message.role === 'assistant').at(-1);
        if (!last || ['error', 'aborted'].includes(last.stopReason)) {
          throw Object.assign(new Error(`runtime turn failed: ${last?.stopReason ?? 'missing-assistant'}`), summarizeFailure(last, 'prompt'));
        }
        return { settled: receipt.settled, requests: capture.requests.length, stopReason: last.stopReason };
      } catch (error) {
        try { await session.abort(); } catch (abortError) { receipt.abortFailure = summarizeFailure(abortError, 'prompt-abort'); }
        throw error;
      } finally { clearTimeout(timer); off(); }
    },
    async close() {
      if (!closed) {
        const cleanup = receipt.cleanup = { aborted: false, shutdown: false, disposed: false, failures: [] };
        for (const [stage, operation] of [
          ['abort', async () => { await session.abort(); cleanup.aborted = true; }],
          ['shutdown', async () => { await session.extensionRunner.emit({ type: 'session_shutdown', reason: 'quit' });
            cleanup.shutdown = capture.events.some(event => event.type === 'session_shutdown'); }],
          ['unsubscribe', () => unsubscribe()],
          ['dispose', () => { session.dispose(); cleanup.disposed = true; }],
        ]) {
          try { await operation(); } catch (error) { cleanup.failures.push(summarizeFailure(error, stage)); }
        }
        closed = true;
        if (cleanup.failures.length) throw new Error('runtime cleanup failed');
      }
      return receipt.cleanup;
    },
  };
}
