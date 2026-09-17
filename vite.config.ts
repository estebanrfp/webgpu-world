import { defineConfig } from 'vite';
import { viteStaticCopy } from 'vite-plugin-static-copy';

export default defineConfig({
  base: './',
  plugins: [
    viteStaticCopy({
      targets: [
        {
          // Copy the tree, not 'assets/**/*': that glob matches directories as
          // well as files, so every file was emitted once inside its folder and
          // again flattened next to it - three copies of each asset, and a
          // Pages artifact over the 1 GB limit.
          src: 'assets',
          dest: '.'
        }
      ]
    })
  ],
  server: {
    port: 3000,
    open: true
  },
  build: {
    target: 'esnext',
    sourcemap: true
  },
  resolve: {
    alias: {
      '@': '/src'
    }
  }
});
