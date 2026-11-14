import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.mamacure.app',
  appName: 'MamaCure',
  webDir: 'dist',
  server: {
    url: 'https://mamacure.netlify.app',
    cleartext: true,
  },
};

export default config;
