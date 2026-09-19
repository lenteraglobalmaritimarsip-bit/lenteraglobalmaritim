import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  return {
    // UBAH BARIS INI: Menggunakan tanda titik untuk jalur relatif agar CSS & JS tidak 404
    base: './', 
    
    plugins: [react()],
    define: {
      'process.env': env
    }
  }
})
