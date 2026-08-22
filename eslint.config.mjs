import { FlatCompat } from '@eslint/eslintrc';

const compat = new FlatCompat({ baseDirectory: import.meta.dirname });

export default [
  {
    ignores: [
      '.next/**',
      'out/**',
      'node_modules/**',
      'public/**',
      'extension/**',
      'next-env.d.ts',
    ],
  },
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  {
    rules: {
      // Podglądy stron/miniatury to blob: i data: URL w eksporcie statycznym — next/image nic tu nie optymalizuje
      '@next/next/no-img-element': 'off',
      // Konwencja: nazwa z prefiksem _ = celowo nieużywana (parametr interfejsu, destrukturyzacja)
      '@typescript-eslint/no-unused-vars': ['warn', {
        argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_', destructuredArrayIgnorePattern: '^_',
      }],
    },
  },
  {
    // Skrypty pomocnicze CommonJS (.cjs) — require() jest tam poprawne
    files: ['**/*.cjs'],
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
];
