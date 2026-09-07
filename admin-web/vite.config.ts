import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// This app lives inside the Expo repo but is built completely separately:
// its own package.json, its own node_modules, its own tsconfig. Metro never
// looks in here (it is not under app/ or src/), and Vite never looks outside
// this folder. Keeping the two toolchains from seeing each other is the whole
// reason the dashboard is a sibling directory rather than a route in the app.
export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
  build: { outDir: 'dist', sourcemap: true },
});
