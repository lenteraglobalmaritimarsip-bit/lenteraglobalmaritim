import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'net.lenteraglobalmaritim.portal',
  appName: 'LGM Portal',
  webDir: 'dist',
  server: {
    url: 'https://lenteraglobalmaritim.agency',
    cleartext: false,
    allowNavigation: ['lenteraglobalmaritim.agency', 'www.lenteraglobalmaritim.agency'],
  },
  android: {
    allowMixedContent: false,
  },
};

export default config;
