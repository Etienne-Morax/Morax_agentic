import { spawnSync } from 'node:child_process';

const run = (args, options = {}) => {
  const result = spawnSync('supabase', args, {
    stdio: 'inherit',
    shell: false,
    ...options,
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(`supabase ${args.join(' ')} exited with ${result.status ?? 1}`);
  }
};

let stackStarted = false;

try {
  run(['start']);
  stackStarted = true;
  run(['db', 'reset', '--local']);
  run(['db', 'lint', '--local', '--fail-on', 'warning']);

  for (const testFile of [
    'supabase/tests/rls_credits_isolation.sql',
    'supabase/tests/rls_command_messages_isolation.sql',
  ]) {
    console.log(`Running ${testFile}`);
    run(['db', 'query', '--local', '--file', testFile]);
  }
} catch (error) {
  if (error?.code === 'ENOENT') {
    console.error('Supabase CLI is required. Install the pinned CLI or run in CI.');
  } else {
    console.error(error);
  }
  process.exit(1);
} finally {
  if (stackStarted) {
    spawnSync('supabase', ['stop'], { stdio: 'inherit', shell: false });
  }
}
