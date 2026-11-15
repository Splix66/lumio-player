package de.lumio.player;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // eigener TV-Player (ExoPlayer) – muss vor super.onCreate registriert werden
        registerPlugin(NativePlayerPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
