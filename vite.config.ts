import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { gzipSync } from 'node:zlib';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const target = process.env.API_PROXY_TARGET ?? env.API_PROXY_TARGET ?? `http://127.0.0.1:${process.env.PORT ?? env.PORT ?? 8787}`;
  return {
    plugins: [react(), {
      name: 'precompress-assets',
      generateBundle(_options, bundle) {
        for (const file of Object.values(bundle)) {
          if (!/\.(js|css)$/.test(file.fileName)) continue;
          const source = file.type === 'chunk' ? file.code : file.source;
          this.emitFile({ type: 'asset', fileName: file.fileName + '.gz', source: gzipSync(source, { level: 9 }) });
        }
      },
    }],
    server: {
      host: '0.0.0.0',
      port: 5173,
      proxy: {
        '/api': { target, changeOrigin: true },
      },
    },
    build: {
      outDir: 'dist',
      chunkSizeWarningLimit: 2000,
    },
  };
});
