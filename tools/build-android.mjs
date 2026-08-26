import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const cwd = fileURLToPath(new URL('../android/', import.meta.url));
// Fixed command: no user input is interpolated into the Windows shell.
const gradleArgs = [':app:assembleRelease', '--no-daemon', '--console=plain', '--max-workers=2'];
const result = process.platform === 'win32'
  ? spawnSync('cmd.exe', ['/d', '/c', 'gradlew.bat', ...gradleArgs], { cwd, stdio: 'inherit' })
  : spawnSync('bash', ['./gradlew', ...gradleArgs], { cwd, stdio: 'inherit' });
if (result.error) throw result.error;
process.exit(result.status ?? 1);
