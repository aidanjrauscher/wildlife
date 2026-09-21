import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

/**
 * Serves the Vercel serverless functions in `api/` during `vite dev`, so the
 * app works locally without the Vercel CLI. Each `api/<name>.js` default
 * export is a plain Node (req, res) handler, which is also what Vercel calls.
 */
function vercelApiDev() {
  return {
    name: 'vercel-api-dev',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url || !req.url.startsWith('/api/')) return next();
        const name = req.url.slice('/api/'.length).split('?')[0].replace(/[^a-z0-9_-]/gi, '');
        if (!name || name.startsWith('_')) return next();
        try {
          const mod = await server.ssrLoadModule(`/api/${name}.js`);
          await mod.default(req, res);
        } catch (err) {
          if (err instanceof Error) server.ssrFixStacktrace(err);
          console.error(err);
          res.statusCode = 500;
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify({ error: 'Internal error in dev API handler' }));
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), vercelApiDev()],
});
