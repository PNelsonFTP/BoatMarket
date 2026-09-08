import { defineConfig } from 'vitest/config';
export default defineConfig({test:{include:['tests/**/*.test.ts'],testTimeout:20000,hookTimeout:30000,fileParallelism:false},resolve:{alias:{'@':new URL('.',import.meta.url).pathname}}});
