import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import path from 'path';
import {defineConfig, type Plugin} from 'vite';

const repoBase = '/lenteraglobalmaritim';

function findPhpExecutable(): string {
  const configuredPath = process.env.PHP_EXECUTABLE;
  if (configuredPath && existsSync(configuredPath)) return configuredPath;

  if (process.platform === 'win32') {
    const laragonPhpPath = 'C:/laragon/bin/php';
    if (existsSync(laragonPhpPath)) {
      const phpVersions = readdirSync(laragonPhpPath, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => path.join(laragonPhpPath, entry.name))
        .sort((first, second) => second.localeCompare(first, undefined, { numeric: true }));
      const laragonPhp = phpVersions
        .map((versionPath) => path.join(versionPath, 'php.exe'))
        .find(existsSync);
      if (laragonPhp) return laragonPhp;
    }

    const xamppPhp = 'C:/xampp/php/php.exe';
    if (existsSync(xamppPhp)) return xamppPhp;
  }

  return configuredPath || 'php';
}

function phpApiPlugin(): Plugin {
  return {
    name: 'maritimport-php-api',
    configureServer(server) {
      const phpServer: ChildProcess = spawn(
        findPhpExecutable(),
        ['-S', 'localhost:8000', '-t', path.resolve(__dirname)],
        { cwd: path.resolve(__dirname), stdio: 'inherit' },
      );
      phpServer.once('error', (error) => {
        server.config.logger.error(`Unable to start the PHP API server: ${error.message}`);
      });
      server.httpServer?.once('close', () => {
        if (phpServer.exitCode === null && !phpServer.killed) phpServer.kill();
      });
    },
  };
}

export default defineConfig(() => {
  return {
    base: repoBase,
    plugins: [react(), tailwindcss(), phpApiPlugin()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src'),
      },
    },
    server: {
      host: '0.0.0.0',
      port: 3000,
      strictPort: true,
      proxy: {
        '/api': {
          target: 'http://localhost:8000',
          changeOrigin: true,
        },
      },
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
