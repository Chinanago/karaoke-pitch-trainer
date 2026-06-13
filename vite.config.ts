import { defineConfig } from 'vite';

declare const process: { env: Record<string, string | undefined> };

const repoName = process.env.GITHUB_REPOSITORY?.split('/')[1] ?? 'karaoke-pitch-trainer';
const base = process.env.NODE_ENV === 'production' ? `/${repoName}/` : '/';

export default defineConfig({
  base,
  build: {
    target: 'es2022'
  }
});
