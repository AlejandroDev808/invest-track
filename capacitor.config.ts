import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.alejandro.investtrack',
  appName: 'InvestTrack',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
};

export default config;
