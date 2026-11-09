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
 * TV-Player für die Lumio-App: startet den eigenen Android-Videoplayer (ExoPlayer)
 * und meldet beim Schließen Position und Länge zurück (für „Weiterschauen“).
 */
@CapacitorPlugin(name = "NativePlayer")
public class NativePlayerPlugin extends Plugin {

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
        Long startMs = call.getLong("startMs", 0L);
        Boolean live = call.getBoolean("live", false);
        Intent intent = new Intent(getContext(), PlayerActivity.class);
        intent.putExtra("items", items.toString());
        intent.putExtra("index", index == null ? 0 : index.intValue());
        intent.putExtra("startMs", startMs == null ? 0L : startMs.longValue());
        intent.putExtra("live", live != null && live.booleanValue());
        intent.putExtra("txtReconnect", call.getString("txtReconnect", "Verbindung wird wiederhergestellt …"));
        intent.putExtra("txtFailed", call.getString("txtFailed", "Wiedergabe nicht möglich."));
        // Untertitel: Größe (Faktor), Schriftfarbe und Hintergrund aus den App-Einstellungen
        Float subScale = call.getFloat("subScale", 1f);
        intent.putExtra("subScale", subScale == null ? 1f : subScale.floatValue());
        intent.putExtra("subColor", call.getString("subColor", "#FFFFFFFF"));
        intent.putExtra("subBg", call.getString("subBg", "#00000000"));
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
                Intent chooser = Intent.createChooser(i, title != null ? title : "Lumio Player");
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
            String err = data.getStringExtra("error");
            if (err != null) r.put("error", err);
        }
        call.resolve(r);
    }
}
