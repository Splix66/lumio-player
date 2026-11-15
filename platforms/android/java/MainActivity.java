package de.lumio.player;

import android.content.ComponentName;
import android.content.pm.PackageManager;
import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // eigener TV-Player (ExoPlayer) – muss vor super.onCreate registriert werden
        registerPlugin(NativePlayerPlugin.class);
        super.onCreate(savedInstanceState);
        tvStartEintrag();
    }

    /**
     * App-Kachel auf Fernsehern randlos: Fire TV nimmt bei Apps, die nicht aus dem Amazon Appstore kommen, nicht das
     * Banner, sondern das Symbol des Start-Eintrags und setzt es mittig in die 16:9-Kachel – das quadratische Symbol
     * bekam graue Balken links und rechts (Fire TV Stick 4K Max, Fire OS 8, 15.11.2026).
     * Es gibt zwei Start-Einträge (scripts/patch-android.js): „.Start“ mit quadratischem Symbol (an) und „.TvStart“
     * mit dem breiten Banner als Symbol (aus). Auf einem Fernseher schaltet die App beim Start einmalig um: TvStart an,
     * Start aus. Der neue Eintrag hat einen anderen Namen, deshalb lädt der Startbildschirm das Bild neu, statt das
     * alte gespeicherte zu zeigen. Handys bleiben unverändert.
     */
    private void tvStartEintrag() {
        try {
            if (!istFernseher()) return;
            PackageManager pm = getPackageManager();
            ComponentName tv = new ComponentName(this, getPackageName() + ".TvStart");
            ComponentName handy = new ComponentName(this, getPackageName() + ".Start");
            if (pm.getComponentEnabledSetting(tv) != PackageManager.COMPONENT_ENABLED_STATE_ENABLED) {
                pm.setComponentEnabledSetting(tv, PackageManager.COMPONENT_ENABLED_STATE_ENABLED, PackageManager.DONT_KILL_APP);
            }
            if (pm.getComponentEnabledSetting(handy) != PackageManager.COMPONENT_ENABLED_STATE_DISABLED) {
                pm.setComponentEnabledSetting(handy, PackageManager.COMPONENT_ENABLED_STATE_DISABLED, PackageManager.DONT_KILL_APP);
            }
        } catch (Throwable ignored) {
            // nur Schönheit – die App startet in jedem Fall
        }
    }

    private boolean istFernseher() {
        PackageManager pm = getPackageManager();
        android.app.UiModeManager um = (android.app.UiModeManager) getSystemService(UI_MODE_SERVICE);
        return (um != null && um.getCurrentModeType() == android.content.res.Configuration.UI_MODE_TYPE_TELEVISION)
                || pm.hasSystemFeature(PackageManager.FEATURE_LEANBACK)
                || pm.hasSystemFeature("android.software.leanback_only")
                || pm.hasSystemFeature("amazon.hardware.fire_tv");
    }
}
