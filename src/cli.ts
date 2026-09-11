import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { defaultRoots, providers } from './collector.ts';
import { evaluateArtifacts, validateSuite, runModels, promptfooConfig } from './lab.ts';
import { exampleSuite } from './demo.ts';
import type { Provider } from './types.ts';
export function hookConfiguration(
  provider: Provider,
  nodePath = process.execPath,
  root = resolve(dirname(fileURLToPath(import.meta.url)), '..'),
  dataDir = process.env.OBSERVATORY_DATA_DIR ?? join(homedir(), '.session-observatory'),
) {
  // POSIX shell quoting: all command components are trusted installer paths.
  const q = (s: string) => "'" + s.replace(/'/g, "'\\''") + "'";
  const events =
    provider === 'cursor'
      ? ['beforeSubmitPrompt', 'afterAgentResponse', 'stop']
      : [
          'SessionStart',
          'UserPromptSubmit',
          'PermissionRequest',
          'Notification',
          'PostToolUse',
          'Stop',
          'SessionEnd',
        ];
  const hooks = Object.fromEntries(
    events.map((event) => {
      const command = [nodePath, join(root, 'bin/hook.mjs'), provider, event, dataDir]
        .map(q)
        .join(' ');
      return [
        event,
        provider === 'cursor'
          ? [{ command }]
          : [{ hooks: [{ type: 'command', command, timeout: 2 }] }],
      ];
    }),
  );
  return provider === 'cursor' ? { version: 1, hooks } : { hooks };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [command, arg, ...rest] = process.argv.slice(2);
  try {
    if (command === 'doctor')
      console.log(
        JSON.stringify(
          {
            node: process.version,
            platform: process.platform,
            standalone: true,
            sourceRoots: Object.fromEntries(
              providers.map((p) => [p, defaultRoots()[p].filter(existsSync)]),
            ),
            navigation: {
              codex: 'Installed-source route: preview, not UI-certified',
              claude: 'Exact native chat opening not verified',
              cursor: 'Exact native chat opening not verified',
            },
            hooks: 'Not installed by this command',
          },
          null,
          2,
        ),
      );
    else if (command === 'hooks' && providers.includes(arg as Provider))
      console.log(JSON.stringify(hookConfiguration(arg as Provider), null, 2));
    else if (command === 'example')
      console.log(
        JSON.stringify({ ...exampleSuite(), id: 'my-html-skill', name: 'My HTML skill' }, null, 2),
      );
    else if (['evaluate', 'promptfoo', 'optimize'].includes(command) && arg) {
      const suite = JSON.parse(await readFile(resolve(arg), 'utf8'));
      validateSuite(suite);
      if (command === 'promptfoo') console.log(JSON.stringify(promptfooConfig(suite), null, 2));
      else if (command === 'evaluate')
        console.log(JSON.stringify(evaluateArtifacts(suite), null, 2));
      else {
        if (!rest.includes('--approve-model-transfer'))
          throw new Error(
            'Review the suite and configured model endpoint, then explicitly pass --approve-model-transfer to send these inputs.',
          );
        if (!process.env.OBS_MODEL_ENDPOINT || !process.env.OBS_MODEL_NAME)
          throw new Error('Set OBS_MODEL_ENDPOINT and OBS_MODEL_NAME first.');
        const result = await runModels(
          suite,
          {
            kind: process.env.OBS_MODEL_KIND === 'anthropic' ? 'anthropic' : 'openai-compatible',
            endpoint: process.env.OBS_MODEL_ENDPOINT,
            model: process.env.OBS_MODEL_NAME,
            apiKey: process.env.OBS_MODEL_API_KEY,
            maxCalls: Math.max(1, Math.min(100, Number(process.env.OBS_MODEL_MAX_CALLS) || 12)),
          },
          (message) => console.error(message),
          true,
        );
        const path = resolve(`${suite.id}-evaluation-${result.report.id.slice(0, 8)}.json`);
        await writeFile(path, JSON.stringify(result, null, 2), { flag: 'wx', mode: 0o600 });
        console.log(path);
      }
    } else
      console.log(
        'Observatory Switchboard\n  start | demo\n  doctor\n  hooks codex|claude|cursor    Print a config fragment; never installs it\n  example                    Print an editable suite template\n  evaluate suite.json        Check saved artifacts locally\n  promptfoo suite.json        Export a provider-neutral configuration draft\n  optimize suite.json --approve-model-transfer\n                             Run a bounded candidate/evaluation batch using configured model access',
      );
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Command failed');
    process.exitCode = 1;
  }
}
