import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  // Memastikan semua variabel lingkungan (.env & GitHub Secrets) termuat dengan benar
  const env = loadEnv(mode, process.cwd(), '')

  return {
    // Sesuaikan base path dengan nama repositori GitHub Pages Anda
    base: '/lenteraglobalmaritim/',
    
    plugins: [react()],
    
    define: {
      // Menyuntikkan fallback aman jika env tidak sengaja kosong di production
      'process.env': env
    }
  }
})
