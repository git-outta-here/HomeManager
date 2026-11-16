import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // Relative paths, so the build works from a sub-folder such as GitHub Pages.
  base: './',
  // PORT lets a launcher pick a free port when 5174 is taken by another project.
  server: { port: Number(process.env.PORT) || 5174, strictPort: !!process.env.PORT, host: true },
})
