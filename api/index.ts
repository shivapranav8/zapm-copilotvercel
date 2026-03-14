import { createRequire } from 'module';

// Use the pre-built tsup bundle instead of compiling from source.
// This avoids ESM/CJS conflicts and prevents Vercel from bundling
// all heavy deps (LangChain, OpenAI, etc.) from scratch.
const require = createRequire(import.meta.url);
const serverBundle = require('../dist/server/index.cjs');
const app = serverBundle.default ?? serverBundle;

export default app;
