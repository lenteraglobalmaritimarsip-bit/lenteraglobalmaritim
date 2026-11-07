package net.lenteraglobalmaritim.portal;

import android.content.Context;
import android.content.ContentValues;
import android.content.Intent;
import android.net.Uri;
import android.os.Environment;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.graphics.Color;
import android.app.Dialog;
import android.print.PrintAttributes;
import android.print.PrintJob;
import android.print.PrintManager;
import android.provider.MediaStore;
import android.app.Activity;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

import androidx.biometric.BiometricManager;
import androidx.biometric.BiometricPrompt;
import androidx.core.content.ContextCompat;
import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;
import java.security.KeyPairGenerator;
import java.security.KeyStore;
import java.security.Signature;
import java.security.spec.ECGenParameterSpec;
import java.util.UUID;
import java.util.concurrent.Executor;

@CapacitorPlugin(name = "LgmNative")
public class LgmNativePlugin extends Plugin {
    private static final String KEY_ALIAS = "lgm-biometric-login-v1";
    private static final String PREFS = "lgm_native_auth";
    private static final String PREF_DEVICE_ID = "device_id";
    private static final String PREF_USERNAME = "biometric_username";

    @PluginMethod
    public void getBiometricState(PluginCall call) {
        int result = BiometricManager.from(getContext()).canAuthenticate(BiometricManager.Authenticators.BIOMETRIC_STRONG);
        boolean available = result == BiometricManager.BIOMETRIC_SUCCESS;
        boolean enrolled = available && hasPrivateKey() && !getPreferences().getString(PREF_USERNAME, "").isEmpty();
        JSObject response = new JSObject();
        response.put("available", available);
        response.put("enrolled", enrolled);
        response.put("deviceId", enrolled ? deviceId() : "");
        response.put("username", enrolled ? getPreferences().getString(PREF_USERNAME, "") : "");
        call.resolve(response);
    }

    @PluginMethod
    public void prepareBiometricKey(PluginCall call) {
        if (BiometricManager.from(getContext()).canAuthenticate(BiometricManager.Authenticators.BIOMETRIC_STRONG)
                != BiometricManager.BIOMETRIC_SUCCESS) {
            call.reject("Perangkat belum memiliki sidik jari/biometrik kuat yang terdaftar.");
            return;
        }
        try {
            KeyStore keyStore = KeyStore.getInstance("AndroidKeyStore");
            keyStore.load(null);
            if (!keyStore.containsAlias(KEY_ALIAS)) {
                KeyPairGenerator generator = KeyPairGenerator.getInstance(KeyProperties.KEY_ALGORITHM_EC, "AndroidKeyStore");
                KeyGenParameterSpec.Builder spec = new KeyGenParameterSpec.Builder(
                        KEY_ALIAS,
                        KeyProperties.PURPOSE_SIGN
                )
                        .setAlgorithmParameterSpec(new ECGenParameterSpec("secp256r1"))
                        .setDigests(KeyProperties.DIGEST_SHA256)
                        .setUserAuthenticationRequired(true)
                        .setInvalidatedByBiometricEnrollment(true);
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                    spec.setUserAuthenticationParameters(0, KeyProperties.AUTH_BIOMETRIC_STRONG);
                } else {
                    spec.setUserAuthenticationValidityDurationSeconds(-1);
                }
                generator.initialize(spec.build());
                generator.generateKeyPair();
            }
            String publicKey = Base64.encodeToString(
                    keyStore.getCertificate(KEY_ALIAS).getPublicKey().getEncoded(),
                    Base64.NO_WRAP
            );
            JSObject response = new JSObject();
            response.put("deviceId", deviceId());
            response.put("publicKey", publicKey);
            call.resolve(response);
        } catch (Exception error) {
            call.reject("Kunci aman perangkat gagal dibuat.", error);
        }
    }

    @PluginMethod
    public void signBiometricMessage(PluginCall call) {
        String message = call.getString("message", "");
        if (message.isEmpty() || message.length() > 1024) {
            call.reject("Tantangan biometrik tidak valid.");
            return;
        }
        try {
            KeyStore keyStore = KeyStore.getInstance("AndroidKeyStore");
            keyStore.load(null);
            if (!keyStore.containsAlias(KEY_ALIAS)) {
                call.reject("Kunci biometrik perangkat tidak ditemukan. Login dengan password untuk mengaktifkan kembali.");
                return;
            }
            Signature signature = Signature.getInstance("SHA256withECDSA");
            signature.initSign((java.security.PrivateKey) keyStore.getKey(KEY_ALIAS, null));
            Executor executor = ContextCompat.getMainExecutor(getContext());
            BiometricPrompt prompt = new BiometricPrompt(getActivity(), executor, new BiometricPrompt.AuthenticationCallback() {
                @Override
                public void onAuthenticationSucceeded(BiometricPrompt.AuthenticationResult result) {
                    try {
                        Signature authorizedSignature = result.getCryptoObject().getSignature();
                        authorizedSignature.update(message.getBytes(java.nio.charset.StandardCharsets.UTF_8));
                        JSObject response = new JSObject();
                        response.put("signature", Base64.encodeToString(authorizedSignature.sign(), Base64.NO_WRAP));
                        call.resolve(response);
                    } catch (Exception error) {
                        call.reject("Tantangan gagal ditandatangani.", error);
                    }
                }

                @Override
                public void onAuthenticationError(int errorCode, CharSequence errString) {
                    call.reject("Autentikasi biometrik dibatalkan atau gagal: " + errString);
                }
            });
            BiometricPrompt.PromptInfo promptInfo = new BiometricPrompt.PromptInfo.Builder()
                    .setTitle("Verifikasi login LGM")
                    .setSubtitle("Konfirmasi identitas untuk melanjutkan")
                    .setNegativeButtonText("Batal")
                    .setAllowedAuthenticators(BiometricManager.Authenticators.BIOMETRIC_STRONG)
                    .build();
            prompt.authenticate(promptInfo, new BiometricPrompt.CryptoObject(signature));
        } catch (Exception error) {
            call.reject("Autentikasi biometrik tidak dapat dimulai.", error);
        }
    }

    @PluginMethod
    public void rememberBiometricAccount(PluginCall call) {
        String username = call.getString("username", "").trim();
        if (username.isEmpty() || username.length() > 100 || !hasPrivateKey()) {
            call.reject("Akun untuk login biometrik tidak valid.");
            return;
        }
        getPreferences().edit().putString(PREF_USERNAME, username).apply();
        call.resolve();
    }

    @PluginMethod
    public void openPdf(PluginCall call) {
        openFile(call, "application/pdf");
    }

    @PluginMethod
    public void openFile(PluginCall call) {
        String mimeType = call.getString("mimeType", "");
        if (!"application/pdf".equals(mimeType)
                && !"image/jpeg".equals(mimeType)
                && !"image/png".equals(mimeType)
                && !"image/webp".equals(mimeType)) {
            call.reject("Tipe berkas ini tidak didukung untuk dibuka di Android.");
            return;
        }
        openFile(call, mimeType);
    }

    private void openFile(PluginCall call, String mimeType) {
        String encoded = call.getString("contentBase64", "");
        String fallbackName = "application/pdf".equals(mimeType) ? "dokumen.pdf" : "dokumen";
        String fileName = call.getString("fileName", fallbackName)
                .replaceAll("[^A-Za-z0-9._-]", "_");
        if (encoded.isEmpty() || encoded.length() > 20 * 1024 * 1024) {
            call.reject("Berkas PDF kosong atau terlalu besar untuk dibuka.");
            return;
        }
        try {
            byte[] data = Base64.decode(encoded, Base64.DEFAULT);
            File directory = new File(getContext().getCacheDir(), "exports");
            if (!directory.exists() && !directory.mkdirs()) {
                call.reject("Folder sementara untuk PDF gagal dibuat.");
                return;
            }
            File file = new File(directory, fileName);
            try (FileOutputStream stream = new FileOutputStream(file)) {
                stream.write(data);
            }
            Uri uri = FileProvider.getUriForFile(
                    getContext(),
                    getContext().getPackageName() + ".fileprovider",
                    file
            );
            Intent intent = new Intent(Intent.ACTION_VIEW);
            intent.setDataAndType(uri, mimeType);
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(Intent.createChooser(intent, "Buka surat permohonan"));
            call.resolve();
        } catch (Exception error) {
            call.reject("Tidak ada aplikasi yang dapat membuka PDF atau berkas gagal disiapkan.", error);
        }
    }

    @PluginMethod
    public void downloadBase64(PluginCall call) {
        String encoded = call.getString("contentBase64", "");
        String fileName = call.getString("fileName", "unduhan")
                .replaceAll("[^A-Za-z0-9._-]", "_");
        String mimeType = call.getString("mimeType", "application/octet-stream");
        if (encoded.isEmpty() || encoded.length() > 32 * 1024 * 1024 || mimeType.length() > 120) {
            call.reject("File unduhan kosong, terlalu besar, atau memiliki tipe yang tidak valid.");
            return;
        }
        try {
            byte[] data = Base64.decode(encoded, Base64.DEFAULT);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                ContentValues values = new ContentValues();
                values.put(MediaStore.Downloads.DISPLAY_NAME, fileName);
                values.put(MediaStore.Downloads.MIME_TYPE, mimeType);
                values.put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS);
                Uri uri = getContext().getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
                if (uri == null) throw new IllegalStateException("File unduhan tidak dapat dibuat.");
                try (java.io.OutputStream stream = getContext().getContentResolver().openOutputStream(uri)) {
                    if (stream == null) throw new IllegalStateException("File unduhan tidak dapat dibuka.");
                    stream.write(data);
                }
            } else {
                File directory = getContext().getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
                if (directory == null || (!directory.exists() && !directory.mkdirs())) {
                    throw new IllegalStateException("Folder unduhan tidak tersedia.");
                }
                try (FileOutputStream stream = new FileOutputStream(new File(directory, fileName))) {
                    stream.write(data);
                }
            }
            Toast.makeText(getContext(), "File berhasil disimpan di folder Unduhan.", Toast.LENGTH_LONG).show();
            call.resolve();
        } catch (Exception error) {
            call.reject("File gagal disimpan ke folder Unduhan.", error);
        }
    }

    @PluginMethod
    public void previewHtml(PluginCall call) {
        String html = call.getString("html", "");
        String title = call.getString("title", "Dokumen LGM")
                .replaceAll("[^A-Za-z0-9._ -]", "_")
                .trim();
        if (html.isEmpty() || html.length() > 5 * 1024 * 1024) {
            call.reject("Dokumen kosong atau terlalu besar untuk dicetak.");
            return;
        }
        Activity activity = getActivity();
        if (activity == null || activity.isFinishing() || activity.isDestroyed()) {
            call.reject("Layar aplikasi sudah ditutup. Buka kembali sebelum mencetak.");
            return;
        }
        activity.runOnUiThread(() -> {
            try {
                String jobName = title.isEmpty() ? "Dokumen LGM" : title;
                float density = activity.getResources().getDisplayMetrics().density;
                Dialog dialog = new Dialog(activity);
                LinearLayout content = new LinearLayout(activity);
                content.setOrientation(LinearLayout.VERTICAL);
                content.setBackgroundColor(Color.WHITE);

                LinearLayout toolbar = new LinearLayout(activity);
                toolbar.setGravity(Gravity.CENTER_VERTICAL);
                toolbar.setPadding((int) (12 * density), 0, (int) (8 * density), 0);
                toolbar.setBackgroundColor(Color.WHITE);
                TextView documentTitle = new TextView(activity);
                documentTitle.setText(jobName);
                documentTitle.setTextColor(Color.rgb(23, 32, 51));
                documentTitle.setTextSize(15);
                documentTitle.setMaxLines(1);
                documentTitle.setEllipsize(android.text.TextUtils.TruncateAt.END);
                toolbar.addView(documentTitle, new LinearLayout.LayoutParams(0, (int) (56 * density), 1));

                Button closeButton = new Button(activity);
                closeButton.setText("Tutup");
                toolbar.addView(closeButton, new LinearLayout.LayoutParams(
                        ViewGroup.LayoutParams.WRAP_CONTENT,
                        (int) (48 * density)
                ));
                Button printButton = new Button(activity);
                printButton.setText("Cetak / PDF");
                printButton.setEnabled(false);
                toolbar.addView(printButton, new LinearLayout.LayoutParams(
                        ViewGroup.LayoutParams.WRAP_CONTENT,
                        (int) (48 * density)
                ));

                TextView loadingStatus = new TextView(activity);
                loadingStatus.setText("Memuat hasil dokumen...");
                loadingStatus.setTextColor(Color.DKGRAY);
                loadingStatus.setGravity(Gravity.CENTER);
                content.addView(toolbar, new LinearLayout.LayoutParams(
                        ViewGroup.LayoutParams.MATCH_PARENT,
                        (int) (56 * density)
                ));
                content.addView(loadingStatus, new LinearLayout.LayoutParams(
                        ViewGroup.LayoutParams.MATCH_PARENT,
                        (int) (36 * density)
                ));

                WebView printWebView = new WebView(activity);
                printWebView.setBackgroundColor(Color.WHITE);
                printWebView.getSettings().setJavaScriptEnabled(false);
                printWebView.getSettings().setAllowFileAccess(false);
                printWebView.getSettings().setAllowContentAccess(false);
                printWebView.getSettings().setBuiltInZoomControls(true);
                printWebView.getSettings().setDisplayZoomControls(false);
                content.addView(printWebView, new LinearLayout.LayoutParams(
                        ViewGroup.LayoutParams.MATCH_PARENT,
                        0,
                        1
                ));
                dialog.setContentView(content);
                dialog.setCancelable(true);
                boolean[] printing = {false};
                dialog.setOnDismissListener(ignored -> {
                    if (!printing[0]) printWebView.destroy();
                });
                closeButton.setOnClickListener(ignored -> dialog.dismiss());
                printButton.setOnClickListener(ignored -> {
                    try {
                        PrintManager printManager = (PrintManager) activity.getSystemService(Context.PRINT_SERVICE);
                        if (printManager == null) throw new IllegalStateException("Layanan cetak Android tidak tersedia.");
                        PrintJob job = printManager.print(
                                jobName,
                                printWebView.createPrintDocumentAdapter(jobName),
                                new PrintAttributes.Builder()
                                        .setColorMode(PrintAttributes.COLOR_MODE_COLOR)
                                        .build()
                        );
                        printing[0] = true;
                        dialog.dismiss();
                        monitorPrintJob(job, printWebView);
                    } catch (Exception error) {
                        Toast.makeText(activity, "Dialog cetak gagal dibuka: " + error.getMessage(), Toast.LENGTH_LONG).show();
                    }
                });
                printWebView.setWebViewClient(new WebViewClient() {
                    @Override
                    public void onPageFinished(WebView view, String url) {
                        printButton.setEnabled(true);
                        loadingStatus.setVisibility(View.GONE);
                    }

                    @Override
                    public boolean shouldOverrideUrlLoading(WebView view, String url) {
                        return true;
                    }
                });
                dialog.show();
                if (dialog.getWindow() != null) {
                    dialog.getWindow().setLayout(
                            ViewGroup.LayoutParams.MATCH_PARENT,
                            ViewGroup.LayoutParams.MATCH_PARENT
                    );
                }
                printWebView.loadDataWithBaseURL(
                        "https://lenteraglobalmaritim.agency/",
                        html,
                        "text/html",
                        "UTF-8",
                        null
                );
                call.resolve();
            } catch (Exception error) {
                call.reject("Dokumen gagal dibuka untuk dilihat atau dicetak.", error);
            }
        });
    }

    private void monitorPrintJob(PrintJob job, WebView webView) {
        if (job.isCompleted() || job.isCancelled() || job.isFailed()) {
            webView.destroy();
            return;
        }
        new Handler(Looper.getMainLooper()).postDelayed(() -> monitorPrintJob(job, webView), 2000);
    }

    private boolean hasPrivateKey() {
        try {
            KeyStore keyStore = KeyStore.getInstance("AndroidKeyStore");
            keyStore.load(null);
            return keyStore.containsAlias(KEY_ALIAS);
        } catch (Exception error) {
            return false;
        }
    }

    private String deviceId() {
        String existing = getPreferences().getString(PREF_DEVICE_ID, "");
        if (!existing.isEmpty()) return existing;
        String generated = UUID.randomUUID().toString().replace("-", "");
        getPreferences().edit().putString(PREF_DEVICE_ID, generated).apply();
        return generated;
    }

    private android.content.SharedPreferences getPreferences() {
        return getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }
}
