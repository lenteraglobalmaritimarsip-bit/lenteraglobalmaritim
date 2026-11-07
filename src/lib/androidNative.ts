import { Capacitor, registerPlugin } from '@capacitor/core';

export interface BiometricIdentity {
  available: boolean;
  enrolled: boolean;
  username?: string;
  deviceId?: string;
}

interface PreparedBiometricKey {
  deviceId: string;
  publicKey: string;
}

interface SignedBiometricMessage {
  signature: string;
}

interface LgmNativePlugin {
  getBiometricState(): Promise<BiometricIdentity>;
  prepareBiometricKey(): Promise<PreparedBiometricKey>;
  signBiometricMessage(options: { message: string }): Promise<SignedBiometricMessage>;
  rememberBiometricAccount(options: { username: string }): Promise<void>;
  openPdf(options: { fileName: string; contentBase64: string }): Promise<void>;
  openFile(options: { fileName: string; mimeType: string; contentBase64: string }): Promise<void>;
  downloadBase64(options: { fileName: string; mimeType: string; contentBase64: string }): Promise<void>;
  printHtml(options: { title: string; html: string }): Promise<void>;
}

const LgmNative = registerPlugin<LgmNativePlugin>('LgmNative');

export const isAndroidApp = (): boolean =>
  Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';

export const androidNative = {
  async biometricState(): Promise<BiometricIdentity> {
    if (!isAndroidApp()) return { available: false, enrolled: false };
    return LgmNative.getBiometricState();
  },
  async prepareBiometricKey(): Promise<PreparedBiometricKey> {
    return LgmNative.prepareBiometricKey();
  },
  async signBiometricMessage(message: string): Promise<string> {
    const result = await LgmNative.signBiometricMessage({ message });
    return result.signature;
  },
  async rememberBiometricAccount(username: string): Promise<void> {
    await LgmNative.rememberBiometricAccount({ username });
  },
  async openPdf(fileName: string, contentBase64: string): Promise<void> {
    await LgmNative.openPdf({ fileName, contentBase64 });
  },
  async openFile(fileName: string, mimeType: string, contentBase64: string): Promise<void> {
    await LgmNative.openFile({ fileName, mimeType, contentBase64 });
  },
  async downloadBase64(fileName: string, mimeType: string, contentBase64: string): Promise<void> {
    await LgmNative.downloadBase64({ fileName, mimeType, contentBase64 });
  },
  async printHtml(title: string, html: string): Promise<void> {
    await LgmNative.printHtml({ title, html });
  },
};
