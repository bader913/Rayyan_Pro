import { createContext, useContext } from 'react';

interface LicenseCtx {
  isExpired: boolean;
}

export const LicenseContext = createContext<LicenseCtx>({ isExpired: false });

export function useLicense() {
  return useContext(LicenseContext);
}
