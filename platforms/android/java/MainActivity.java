package de.lumio.player;

import android.graphics.Color;
import android.os.Bundle;
import android.view.View;
import android.view.ViewGroup;

import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    // Hintergrund hinter Statusleiste und Navigationsleiste – dieselbe Farbe wie die App (capacitor.config.json)
    private static final int BAR_BG = Color.parseColor("#15141f");

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // eigener TV-Player (ExoPlayer) – muss vor super.onCreate registriert werden
        registerPlugin(NativePlayerPlugin.class);
        super.onCreate(savedInstanceState);
        keepWebViewOutOfSystemBars();
    }

    /* Ab Android 15 zeichnen Apps bis unter Statusleiste, Kamera-Loch und Navigationsleiste (edge-to-edge).
       Die WebView meldet diese Ränder der Seite nicht zuverlässig (env(safe-area-inset-*) bleibt 0) –
       dann lagen Logo, Sprache und Knöpfe unter Uhrzeit, Akku und den Android-Knöpfen (Handy quer, 17.11.2026).
       Darum bekommt die WebView hier einen Rand genau so groß wie die Leisten. Fernseher haben keine Leisten (Rand 0). */
    private void keepWebViewOutOfSystemBars() {
        if (getBridge() == null || getBridge().getWebView() == null) return;
        final View web = getBridge().getWebView();
        getWindow().getDecorView().setBackgroundColor(BAR_BG);
        // dunkler Hintergrund → helle Uhrzeit und helle Symbole in den Leisten
        WindowInsetsControllerCompat bars = WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        bars.setAppearanceLightStatusBars(false);
        bars.setAppearanceLightNavigationBars(false);
        ViewCompat.setOnApplyWindowInsetsListener(web, (v, insets) -> {
            Insets in = insets.getInsets(WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout());
            ViewGroup.LayoutParams lp = v.getLayoutParams();
            if (lp instanceof ViewGroup.MarginLayoutParams) {
                ViewGroup.MarginLayoutParams m = (ViewGroup.MarginLayoutParams) lp;
                if (m.leftMargin != in.left || m.topMargin != in.top || m.rightMargin != in.right || m.bottomMargin != in.bottom) {
                    m.setMargins(in.left, in.top, in.right, in.bottom);
                    v.setLayoutParams(m);
                }
            }
            return WindowInsetsCompat.CONSUMED;
        });
        ViewCompat.requestApplyInsets(web);
    }
}
