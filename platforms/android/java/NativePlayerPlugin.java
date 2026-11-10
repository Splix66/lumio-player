package de.lumio.player;

import android.content.Intent;
import android.net.Uri;

import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * TV-Player für die Telvo-App: startet den eigenen Android-Videoplayer (ExoPlayer)
 * und meldet beim Schließen Position und Länge zurück (für „Weiterschauen“).
 */
@CapacitorPlugin(name = "NativePlayer")
public class NativePlayerPlugin extends Plugin {

    private static final String CRASH_PREFS = "telvo_crash";

    /**
     * Absturz merken: Stürzt der Android-Teil ab (TV-Player, Plugins), wird Art, Meldung und Stelle kurz gespeichert.
     * Beim nächsten Start holt die App das mit takeCrash() ab und schreibt es ins Fehlerprotokoll
     * (Links und Zugangsdaten entfernt die App dort). Danach läuft der normale Absturz von Android weiter.
     */
    @Override
    public void load() {
        Thread.UncaughtExceptionHandler prev = Thread.getDefaultUncaughtExceptionHandler();
        if (prev instanceof CrashSaver) return;
        Thread.setDefaultUncaughtExceptionHandler(new CrashSaver(getContext().getApplicationContext(), prev));
    }

    static class CrashSaver implements Thread.UncaughtExceptionHandler {
        private final android.content.Context ctx;
        private final Thread.UncaughtExceptionHandler prev;

        CrashSaver(android.content.Context ctx, Thread.UncaughtExceptionHandler prev) {
            this.ctx = ctx;
            this.prev = prev;
        }

        @Override
        public void uncaughtException(Thread t, Throwable e) {
            try {
                Throwable root = e;
                while (root.getCause() != null && root.getCause() != root) root = root.getCause();
                StringBuilder sb = new StringBuilder();
                sb.append(root.getClass().getSimpleName());
                if (root.getMessage() != null) sb.append(": ").append(root.getMessage());
                // die ersten Stellen im eigenen Code (sonst die oberste) – reicht, um den Fehler zu finden
                StackTraceElement[] st = root.getStackTrace();
                int shown = 0;
                for (StackTraceElement el : st) {
                    if (shown >= 2) break;
                    if (el.getClassName().startsWith("de.lumio")) {
                        sb.append(" @").append(el.getClassName().replace("de.lumio.player.", "")).append('.').append(el.getMethodName()).append(':').append(el.getLineNumber());
                        shown++;
                    }
                }
                if (shown == 0 && st.length > 0) sb.append(" @").append(st[0].getClassName()).append('.').append(st[0].getMethodName());
                String s = sb.length() > 400 ? sb.substring(0, 400) : sb.toString();
                ctx.getSharedPreferences(CRASH_PREFS, android.content.Context.MODE_PRIVATE).edit().putString("last", s).commit();
            } catch (Throwable ignored) {
            }
            if (prev != null) prev.uncaughtException(t, e);
            else {
                android.os.Process.killProcess(android.os.Process.myPid());
                System.exit(10);
            }
        }
    }

    /** Gemerkten Absturz einmal abholen (und löschen). */
    @PluginMethod
    public void takeCrash(PluginCall call) {
        JSObject r = new JSObject();
        try {
            android.content.SharedPreferences p = getContext().getSharedPreferences(CRASH_PREFS, android.content.Context.MODE_PRIVATE);
            String s = p.getString("last", null);
            if (s != null) {
                r.put("crash", s);
                p.edit().remove("last").apply();
            }
        } catch (Exception ignored) {
        }
        call.resolve(r);
    }

    @PluginMethod
    public void isAvailable(PluginCall call) {
        JSObject r = new JSObject();
        r.put("available", true);
        call.resolve(r);
    }

    @PluginMethod
    public void play(PluginCall call) {
        JSArray items = call.getArray("items");
        if (items == null || items.length() == 0) {
            call.reject("Keine Einträge");
            return;
        }
        Integer index = call.getInt("index", 0);
        long startMs = call.getData().optLong("startMs", 0L); // nicht getLong(): liefert bei Integer-Werten immer 0
        Boolean live = call.getBoolean("live", false);
        Intent intent = new Intent(getContext(), PlayerActivity.class);
        intent.putExtra("items", items.toString());
        intent.putExtra("index", index == null ? 0 : index.intValue());
        intent.putExtra("startMs", Math.max(0L, startMs));
        intent.putExtra("live", live != null && live.booleanValue());
        intent.putExtra("txtReconnect", call.getString("txtReconnect", "Verbindung wird wiederhergestellt …"));
        intent.putExtra("txtFailed", call.getString("txtFailed", "Wiedergabe nicht möglich."));
        intent.putExtra("txtNoChannel", call.getString("txtNoChannel", "Sender {0} nicht gefunden"));
        // Schlaf-Timer: Uhrzeit (ms seit 1970), zu der sich der Player schließt – 0 = aus
        long sleepAt = call.getData().optLong("sleepAt", 0L);
        intent.putExtra("sleepAt", sleepAt);
        // Serien: nächste Folge automatisch (aus = am Ende der Folge anhalten)
        Boolean autoNext = call.getBoolean("autoNext", true);
        intent.putExtra("autoNext", autoNext == null || autoNext.booleanValue());
        // Untertitel: Größe (Faktor), Schriftfarbe und Hintergrund aus den App-Einstellungen
        Float subScale = call.getFloat("subScale", 1f);
        intent.putExtra("subScale", subScale == null ? 1f : subScale.floatValue());
        intent.putExtra("subColor", call.getString("subColor", "#FFFFFFFF"));
        intent.putExtra("subBg", call.getString("subBg", "#00000000"));
        // Klang: off | balance (Lautstärke angleichen) | voice (klare Sprache) | night (Nachtmodus)
        intent.putExtra("sound", call.getString("sound", "off"));
        startActivityForResult(call, intent, "onPlayerResult");
    }

    /**
     * Stream in einer anderen App öffnen (z. B. VLC oder MX Player) oder einen Link im Browser.
     * Mit "pkg" direkt in dieser App, sonst erscheint die Android-Auswahl.
     */
    @PluginMethod
    public void openExternal(PluginCall call) {
        String url = call.getString("url");
        if (url == null || url.isEmpty()) {
            call.reject("url");
            return;
        }
        String type = call.getString("type", null);
        String pkg = call.getString("pkg", null);
        String title = call.getString("title", null);
        Uri u = Uri.parse(url);
        // Sicherheit: nur Web- und Streaming-Adressen öffnen – keine intent:, file: oder content: Links,
        // mit denen sich sonst beliebige App-Bildschirme oder Dateien ansteuern ließen.
        String scheme = u.getScheme() == null ? "" : u.getScheme().toLowerCase(java.util.Locale.ROOT);
        if (!(scheme.equals("http") || scheme.equals("https") || scheme.equals("rtmp") || scheme.equals("rtsp")
                || scheme.equals("rtp") || scheme.equals("udp") || scheme.equals("mms"))) {
            call.reject("scheme");
            return;
        }
        Intent i = new Intent(Intent.ACTION_VIEW);
        if (type != null && !type.isEmpty()) i.setDataAndType(u, type); else i.setData(u);
        if (title != null) {
            i.putExtra("title", title);
            i.putExtra(Intent.EXTRA_TITLE, title);
        }
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            if (pkg != null && !pkg.isEmpty()) {
                i.setPackage(pkg);
                getContext().startActivity(i);
            } else if (type != null && !type.isEmpty()) {
                Intent chooser = Intent.createChooser(i, title != null ? title : "Telvo Player");
                chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(chooser);
            } else {
                getContext().startActivity(i);
            }
            call.resolve();
        } catch (Exception e) {
            call.reject("not_installed");
        }
    }

    /**
     * Nichts im gesicherten Zustand ablegen: Capacitor würde sonst die komplette Senderliste des play()-Aufrufs
     * (bis zu einige 100 KB) zweimal in den Zustand der App schreiben, sobald der Player sie verdeckt.
     * Das sprengt bei großen Listen die Größengrenze von Android (TransactionTooLargeException) und beendet die App.
     */
    @Override
    protected android.os.Bundle saveInstanceState() {
        return null;
    }

    @ActivityCallback
    private void onPlayerResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        JSObject r = new JSObject();
        Intent data = result.getData();
        if (data != null) {
            r.put("index", data.getIntExtra("index", 0));
            r.put("positionMs", data.getLongExtra("positionMs", 0L));
            r.put("durationMs", data.getLongExtra("durationMs", 0L));
            r.put("ended", data.getBooleanExtra("ended", false));
            r.put("sleep", data.getBooleanExtra("sleep", false));
            String err = data.getStringExtra("error");
            if (err != null) r.put("error", err);
        }
        call.resolve(r);
    }
}
