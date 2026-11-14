import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.mamacure.app',
  appName: 'MamaCure',
  webDir: 'dist',
  server: {
    url: 'https://mamacure.netlify.app',
    cleartext: true,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 0,
      launchAutoHide: true,
      showSpinner: false,
    },
  },
};

export default config;
