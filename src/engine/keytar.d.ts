// Type declarations for the keytar package — used for OS keychain storage (Phase F-2)
// Install with: npm install --save-dev @types/keytar or add to devDependencies

declare module 'keytar' {
  /** Get a password from the system keychain */
  export function getPassword(service: string, account: string): Promise<string | null>;
  
  /** Set a password in the system keychain */
  export function setPassword(service: string, account: string, password: string): Promise<void>;
  
  /** Delete a password from the system keychain */
  export function deletePassword(service: string, account: string): Promise<void>;
}