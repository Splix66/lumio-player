package de.lumio.player;

import android.content.Intent;

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
        startActivityForResult(call, intent, "onPlayerResult");
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
