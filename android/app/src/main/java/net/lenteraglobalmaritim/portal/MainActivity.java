package net.lenteraglobalmaritim.portal;

import android.app.DownloadManager;
import android.content.Context;
import android.net.Uri;
import android.os.Environment;
import android.webkit.CookieManager;
import android.webkit.URLUtil;
import android.widget.Toast;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(android.os.Bundle savedInstanceState) {
        registerPlugin(LgmNativePlugin.class);
        super.onCreate(savedInstanceState);
        getBridge().getWebView().setDownloadListener((url, userAgent, contentDisposition, mimeType, contentLength) -> {
            Uri uri = Uri.parse(url);
            String host = uri.getHost();
            if (!"https".equalsIgnoreCase(uri.getScheme())
                    || (!"lenteraglobalmaritim.agency".equalsIgnoreCase(host)
                    && !"www.lenteraglobalmaritim.agency".equalsIgnoreCase(host))) {
                Toast.makeText(this, "Unduhan dari alamat yang tidak dikenal diblokir.", Toast.LENGTH_LONG).show();
                return;
            }
            if ("www.lenteraglobalmaritim.agency".equalsIgnoreCase(host)) {
                uri = uri.buildUpon().authority("lenteraglobalmaritim.agency").build();
            }
            String fileName = URLUtil.guessFileName(url, contentDisposition, mimeType)
                    .replaceAll("[^A-Za-z0-9._-]", "_");
            try {
                DownloadManager.Request request = new DownloadManager.Request(uri)
                        .setTitle(fileName)
                        .setDescription("Mengunduh dari Portal LGM")
                        .setMimeType(mimeType)
                        .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
                        .setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, fileName);
                String cookies = CookieManager.getInstance().getCookie(url);
                if (cookies != null) request.addRequestHeader("Cookie", cookies);
                if (userAgent != null) request.addRequestHeader("User-Agent", userAgent);
                DownloadManager manager = (DownloadManager) getSystemService(Context.DOWNLOAD_SERVICE);
                manager.enqueue(request);
                Toast.makeText(this, "Unduhan dimulai. Buka melalui notifikasi atau folder Downloads.", Toast.LENGTH_LONG).show();
            } catch (Exception error) {
                Toast.makeText(this, "Unduhan gagal dimulai: " + error.getMessage(), Toast.LENGTH_LONG).show();
            }
        });
    }
}
