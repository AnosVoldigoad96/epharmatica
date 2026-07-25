import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    server: {
      deps: {
        // @platejs/math's dist imports katex's stylesheet as a side effect
        // (katex/dist/katex.min.css). Node can't execute .css from
        // node_modules, so route the package through Vite's transform
        // pipeline, which stubs style imports in tests.
        inline: ['@platejs/math'],
      },
    },
  },
})
