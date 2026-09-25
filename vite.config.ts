import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { loadEnv, type ProxyOptions } from 'vite';
import { defineConfig } from 'vitest/config';

// None of the Go services send CORS headers, so the browser only ever talks to this
// dev server and every backend call is proxied by path prefix. Order matters: Vite
// matches proxy keys in insertion order, so the more specific /api/v1/* prefixes must
// come before the catch-all /api/v1 that goes to go-ride-backend.
function buildProxy(env: Record<string, string>): Record<string, ProxyOptions> {
  const target = (key: string, fallback: string) => env[key] || fallback;
  const backend = target('PROXY_BACKEND', 'http://localhost:8080');

  return {
    '/api/v1/cab': { target: target('PROXY_CAB', 'http://localhost:8082'), changeOrigin: true },
    '/api/v1/driver-trips': {
      target: target('PROXY_DRIVER_TRIPS', 'http://localhost:8084'),
      changeOrigin: true,
    },
    '/api/v1/location': {
      target: target('PROXY_LOCATION', 'http://localhost:8081'),
      changeOrigin: true,
    },
    '/api/v1/ws': { target: target('PROXY_WS', 'http://localhost:8083'), changeOrigin: true, ws: true },
    '/api/v1': { target: backend, changeOrigin: true },
    // go-ride-backend's health check lives at the root, outside /api/v1.
    '^/healthz$': { target: backend, changeOrigin: true },
  };
}

export default defineConfig(({ mode }) => {
  // '' prefix loads every variable, not just VITE_* ones — the PROXY_* targets are
  // only needed here in Node and must not be inlined into the client bundle.
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [react(), tailwindcss()],
    server: {
      port: 5173,
      proxy: buildProxy(env),
    },
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: ['./src/test/setup.ts'],
      css: false,
    },
  };
});
