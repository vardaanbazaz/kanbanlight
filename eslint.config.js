import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['**/dist/**', 'cli/**', 'coverage/**'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
    },
  },
  {
    // The data layer must run on every platform: browser storage and tab APIs live only in src/platform/web.
    files: ['src/domain/**/*.ts', 'src/storage/**/*.ts', 'src/commands/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: ['idb', 'react', 'react-dom'],
          patterns: [
            {
              group: ['react-dom/*', '**/services/**', '**/store/**', '**/components/**', '**/platform/**'],
              message: 'The data layer may not depend on the app, the UI or a platform.',
            },
          ],
        },
      ],
      'no-restricted-globals': [
        'error',
        'indexedDB',
        'localStorage',
        'sessionStorage',
        'window',
        'document',
        'navigator',
        'BroadcastChannel',
      ],
    },
  },
  {
    // These files are replaced by the new data layer; the override goes with them.
    files: [
      'src/services/DatabaseService.ts',
      'src/services/BranchingService.ts',
      'src/store/useKanbanStore.ts',
      'src/types/index.ts',
    ],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  }
);
