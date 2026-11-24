import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

// Três builds: processo principal (Node), preload (ponte) e renderer (interface React).
// O electron-vite encontra as entradas pela convenção de pastas em src/.
export default defineConfig({
  main: {},
  preload: {},
  renderer: {
    plugins: [react()]
  }
})
