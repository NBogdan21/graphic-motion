import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ['src/components/brand/**/*.tsx'],
    rules: {
      // Brand rasters are served byte-for-byte (lossless, pre-sized renditions);
      // the image optimizer would re-encode the logo, so plain <img> is intentional.
      '@next/next/no-img-element': 'off',
    },
  },
  globalIgnores(['.next/**', 'out/**', 'build/**', 'next-env.d.ts', 'test-results/**', 'playwright-report/**']),
]);
