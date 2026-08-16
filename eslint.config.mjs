// Flat config (ESLint 9).
//
// This replaces a `lint` script that was a shell loop of `node --check`. That
// only asks "does this file PARSE" — it cannot see an undefined variable, a
// typo'd property, an unused import, or a `return` in the wrong branch. On
// ~1,500 lines of never-linted JS that is close to no gate at all.
//
// Recommended preset only. The aim is to catch real mistakes, not to impose a
// style on an existing codebase.
import js from '@eslint/js'
import globals from 'globals'

export default [
  { ignores: ['node_modules/**', 'data/**', '*.db'] },
  js.configs.recommended,
  {
    rules: {
      // An unused ARGUMENT is often a signature the caller still supplies
      // positionally, so deleting it is a breaking change. Prefixing with `_`
      // marks it deliberate; unused VARIABLES stay errors, because those are
      // dead code with no caller contract to protect.
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    // Server, indexers and scripts run in Node.
    files: ['server.js', 'lib/**/*.js', 'scripts/**/*.{js,mjs}'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'commonjs',
      globals: { ...globals.node },
    },
  },
  {
    // ESM scripts declare their own module type.
    files: ['scripts/**/*.mjs'],
    languageOptions: { sourceType: 'module' },
  },
  {
    // public/app.js is browser code served to the client.
    files: ['public/**/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'script',
      globals: { ...globals.browser },
    },
  },
]
