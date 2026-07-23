import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import fs from 'fs'
import path from 'path'
import { exec } from 'child_process'

const saveToysPlugin = () => ({
  name: 'save-toys-api',
  configureServer(server) {
    server.middlewares.use('/api/save-toys', (req, res, next) => {
      // Allow local devices to access this endpoint
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

      if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
      }

      if (req.method === 'POST') {
        let body = '';
        req.on('data', chunk => {
          body += chunk;
        });
        req.on('end', () => {
          try {
            const payload = JSON.parse(body);
            
            if (!payload || !Array.isArray(payload.toys)) {
              throw new Error('Invalid payload: missing toys array');
            }

            const targetPath = path.resolve(server.config.root, 'public/preloaded-toys.json');
            
            // Format and save JSON
            fs.writeFileSync(targetPath, JSON.stringify(payload, null, 2));
            console.log('Successfully saved toys to preloaded-toys.json. Triggering Git push and deploy...');

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, message: 'Saved and deploying...' }));

            // Run git commit, push, and deploy to GitHub Pages in the background
            const projectRoot = server.config.root;
            const deployCmd = 'git add public/preloaded-toys.json && git commit -m "Auto-update toys catalog [skip ci]" && git push && npm run deploy';
            
            exec(deployCmd, { cwd: projectRoot }, (error, stdout, stderr) => {
              if (error) {
                console.error('Auto-deploy command failed:', error);
              } else {
                console.log('Auto-deploy successful:\n', stdout);
              }
            });

          } catch (err) {
            console.error('Error saving toys:', err);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: err.message }));
          }
        });
      } else {
        next();
      }
    });
  }
});

export default defineConfig({
  base: '/see-and-play/',
  plugins: [
    react(),
    saveToysPlugin(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'masked-icon.svg'],
      manifest: {
        name: 'See and Play',
        short_name: 'SeePlay',
        description: 'Recognizes toddler toys and plays videos or photos',
        theme_color: '#ff6b8b',
        background_color: '#fef6e4',
        display: 'standalone',
        orientation: 'portrait',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      }
    })
  ]
})
