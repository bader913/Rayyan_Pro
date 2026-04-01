export {};

declare global {
  interface Window {
    electronAPI?: {
      openExternal: (url: string) => Promise<void> | void;

      getConnectionConfig: () => Promise<any>;
      saveConnectionConfig: (payload: any) => Promise<any>;

      getDbRuntimeConfig: () => Promise<any>;
      saveDbRuntimeConfig: (payload: any) => Promise<any>;
      clearDbRuntimeConfig: () => Promise<any>;

      isInitialSetupRequired: () => Promise<any>;

      testDbConnection: (payload: any) => Promise<any>;
      runDatabaseSetup: (payload: any) => Promise<any>;

      openConnectionSetup: () => Promise<any>;
      testCurrentDbConnection: () => Promise<any>;

      relaunchApp: () => Promise<any>;
      importActivationFile: () => Promise<{
        ok: boolean;
        canceled?: boolean;
        message?: string;
        data?: {
          path?: string;
        };
      }>;
    };
  }
}