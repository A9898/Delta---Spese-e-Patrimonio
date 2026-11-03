import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'it.patrimonio.app',
  appName: 'Patrimonio',
  webDir: 'dist',
  backgroundColor: '#0e1110',
  android: { backgroundColor: '#0e1110' },
  plugins: {
    // Fa passare fetch() dal layer HTTP nativo: niente CORS per le quotazioni.
    CapacitorHttp: { enabled: true },
    CapacitorSQLite: { androidIsEncryption: false },
    LocalNotifications: { iconColor: '#5fbf8a' },
  },
};

export default config;
