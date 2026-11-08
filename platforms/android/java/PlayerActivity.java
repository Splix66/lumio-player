package de.lumio.player;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.View;
import android.view.WindowManager;
import android.webkit.WebSettings;
import android.widget.FrameLayout;
import android.widget.TextView;

import androidx.media3.common.C;
import androidx.media3.common.MediaItem;
import androidx.media3.common.MediaMetadata;
import androidx.media3.common.MimeTypes;
import androidx.media3.common.PlaybackException;
import androidx.media3.common.Player;
import androidx.media3.datasource.DefaultHttpDataSource;
import androidx.media3.exoplayer.DefaultLoadControl;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory;
import androidx.media3.ui.CaptionStyleCompat;
import androidx.media3.ui.PlayerView;
import androidx.media3.ui.SubtitleView;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

/**
 * Vollbild-Player auf Basis von ExoPlayer (wie bei bekannten IPTV-Apps).
 * - Live: Hoch/Runter (oder Programm +/-) schaltet um, Hänger werden automatisch neu verbunden.
 * - Filme/Folgen: Links/Rechts spult, Folgen laufen automatisch weiter.
 * - Zurück schließt den Player und meldet die Position an die App.
 */
public class PlayerActivity extends Activity {

    private ExoPlayer player;
    private PlayerView view;
    private TextView info;
    private TextView status;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final List<String> urls = new ArrayList<>();
    private final List<String> alts = new ArrayList<>();
    private final List<String> titles = new ArrayList<>();
    private boolean live;
    private boolean ended;
    private boolean closing;
    private int retries;
    private boolean triedAlt;
    private long bufferingSince;
    private String lastError;
    private String txtReconnect = "Verbindung wird wiederhergestellt …";
    private String txtFailed = "Wiedergabe nicht möglich.";

    private final Runnable hideInfo = new Runnable() {
        @Override
        public void run() {
            if (info != null && (view == null || !view.isControllerFullyVisible())) info.setVisibility(View.GONE);
        }
    };

    /* Wächter: hängt der Stream zu lange im Laden fest, wird neu verbunden */
    private final Runnable watchdog = new Runnable() {
        @Override
        public void run() {
            if (player != null && !closing) {
                if (player.getPlaybackState() == Player.STATE_BUFFERING && player.getPlayWhenReady()) {
                    long now = System.currentTimeMillis();
                    if (bufferingSince == 0) bufferingSince = now;
                    else if (now - bufferingSince > (live ? 10000 : 20000)) {
                        bufferingSince = 0;
                        reconnect();
                    }
                } else {
                    bufferingSince = 0;
                }
            }
            handler.postDelayed(this, 2000);
        }
    };

    /** Untertitel wie in den App-Einstellungen: Größe, Schriftfarbe, Hintergrund (mit dunklem Rand für Lesbarkeit). */
    private void applySubtitleStyle(Intent in) {
        try {
            SubtitleView sv = view.getSubtitleView();
            if (sv == null) return;
            int fg = parseColor(in.getStringExtra("subColor"), Color.WHITE);
            int bg = parseColor(in.getStringExtra("subBg"), Color.TRANSPARENT);
            sv.setStyle(new CaptionStyleCompat(fg, bg, Color.TRANSPARENT,
                    bg == Color.TRANSPARENT ? CaptionStyleCompat.EDGE_TYPE_OUTLINE : CaptionStyleCompat.EDGE_TYPE_NONE,
                    Color.BLACK, null));
            float scale = in.getFloatExtra("subScale", 1f);
            if (scale > 0.3f && scale < 3f) sv.setFractionalTextSize(SubtitleView.DEFAULT_TEXT_SIZE_FRACTION * scale);
        } catch (Exception ignored) {
        }
    }

    private static int parseColor(String s, int def) {
        if (s == null || s.isEmpty()) return def;
        try {
            return Color.parseColor(s);
        } catch (Exception e) {
            return def;
        }
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        Intent in = getIntent();
        live = in.getBooleanExtra("live", false);
        int index = in.getIntExtra("index", 0);
        long startMs = in.getLongExtra("startMs", 0L);
        String t1 = in.getStringExtra("txtReconnect");
        String t2 = in.getStringExtra("txtFailed");
        if (t1 != null) txtReconnect = t1;
        if (t2 != null) txtFailed = t2;
        try {
            JSONArray arr = new JSONArray(in.getStringExtra("items"));
            for (int i = 0; i < arr.length(); i++) {
                JSONObject o = arr.getJSONObject(i);
                urls.add(o.optString("url", ""));
                alts.add(o.optString("alt", ""));
                titles.add(o.optString("title", ""));
            }
        } catch (Exception e) {
            lastError = "items";
        }
        if (urls.isEmpty()) {
            finishWith();
            return;
        }
        if (index < 0 || index >= urls.size()) index = 0;

        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.BLACK);
        view = new PlayerView(this);
        view.setKeepScreenOn(true);
        view.setShowSubtitleButton(true);
        view.setControllerShowTimeoutMs(4000);
        view.setControllerAutoShow(false);
        root.addView(view, new FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
        applySubtitleStyle(in);

        info = makeLabel(24);
        FrameLayout.LayoutParams lpInfo = new FrameLayout.LayoutParams(FrameLayout.LayoutParams.WRAP_CONTENT, FrameLayout.LayoutParams.WRAP_CONTENT, Gravity.TOP | Gravity.START);
        lpInfo.setMargins(dp(28), dp(24), dp(28), 0);
        root.addView(info, lpInfo);

        status = makeLabel(20);
        status.setVisibility(View.GONE);
        root.addView(status, new FrameLayout.LayoutParams(FrameLayout.LayoutParams.WRAP_CONTENT, FrameLayout.LayoutParams.WRAP_CONTENT, Gravity.CENTER));

        setContentView(root);
        hideSystemUi();

        view.setControllerVisibilityListener((PlayerView.ControllerVisibilityListener) visibility -> {
            if (visibility == View.VISIBLE) {
                handler.removeCallbacks(hideInfo);
                info.setVisibility(View.VISIBLE);
            } else {
                handler.postDelayed(hideInfo, 300);
                hideSystemUi();
            }
        });

        String ua;
        try {
            ua = WebSettings.getDefaultUserAgent(this);
        } catch (Exception e) {
            ua = "Mozilla/5.0 (Linux; Android) LumioPlayer";
        }
        DefaultHttpDataSource.Factory http = new DefaultHttpDataSource.Factory()
                .setUserAgent(ua)
                .setAllowCrossProtocolRedirects(true)
                .setConnectTimeoutMs(15000)
                .setReadTimeoutMs(20000);
        DefaultLoadControl load = new DefaultLoadControl.Builder()
                .setBufferDurationsMs(15000, 50000, 2000, 4000)
                .build();
        player = new ExoPlayer.Builder(this)
                .setMediaSourceFactory(new DefaultMediaSourceFactory(http))
                .setLoadControl(load)
                .build();
        view.setPlayer(player);

        List<MediaItem> items = new ArrayList<>();
        for (int i = 0; i < urls.size(); i++) items.add(item(urls.get(i), titles.get(i)));
        player.setMediaItems(items, index, live ? C.TIME_UNSET : startMs);
        player.addListener(new Player.Listener() {
            @Override
            public void onPlaybackStateChanged(int state) {
                if (state == Player.STATE_READY) {
                    status.setVisibility(View.GONE);
                    retries = 0;
                } else if (state == Player.STATE_ENDED && !live && !closing) {
                    ended = true;
                    finishWith();
                }
            }

            @Override
            public void onPlayerError(PlaybackException error) {
                handleError(error);
            }

            @Override
            public void onMediaItemTransition(MediaItem mediaItem, int reason) {
                retries = 0;
                triedAlt = false;
                showInfo();
            }
        });
        player.setPlayWhenReady(true);
        player.prepare();
        showInfo();
        handler.postDelayed(watchdog, 2000);
    }

    private TextView makeLabel(int sp) {
        TextView t = new TextView(this);
        t.setTextColor(Color.WHITE);
        t.setTextSize(TypedValue.COMPLEX_UNIT_SP, sp);
        t.setTypeface(Typeface.DEFAULT_BOLD);
        t.setPadding(dp(18), dp(10), dp(18), dp(10));
        GradientDrawable bg = new GradientDrawable();
        bg.setColor(0xCC0B0B0F);
        bg.setCornerRadius(dp(14));
        t.setBackground(bg);
        return t;
    }

    private int dp(int v) {
        return Math.round(TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, getResources().getDisplayMetrics()));
    }

    private MediaItem item(String url, String title) {
        MediaItem.Builder b = new MediaItem.Builder()
                .setUri(Uri.parse(url))
                .setMediaMetadata(new MediaMetadata.Builder().setTitle(title).build());
        if (url.toLowerCase().contains(".m3u8")) b.setMimeType(MimeTypes.APPLICATION_M3U8);
        return b.build();
    }

    private void showInfo() {
        if (player == null || info == null) return;
        int i = player.getCurrentMediaItemIndex();
        if (i < 0 || i >= titles.size()) return;
        info.setText(titles.get(i));
        info.setVisibility(View.VISIBLE);
        handler.removeCallbacks(hideInfo);
        handler.postDelayed(hideInfo, 4000);
    }

    private void showStatus(String text) {
        if (status == null) return;
        status.setText(text);
        status.setVisibility(View.VISIBLE);
    }

    private void reconnect() {
        if (player == null) return;
        showStatus(txtReconnect);
        player.stop();
        if (live) player.seekToDefaultPosition();
        player.prepare();
        player.play();
    }

    private void handleError(PlaybackException e) {
        if (player == null || closing) return;
        if (e.errorCode == PlaybackException.ERROR_CODE_BEHIND_LIVE_WINDOW) {
            player.seekToDefaultPosition();
            player.prepare();
            return;
        }
        final int idx = player.getCurrentMediaItemIndex();
        if (retries < 3) {
            retries++;
            showStatus(txtReconnect);
            handler.postDelayed(() -> {
                if (player != null && !closing) {
                    if (live) player.seekToDefaultPosition();
                    player.prepare();
                    player.play();
                }
            }, 1500L * retries);
            return;
        }
        if (!triedAlt && idx >= 0 && idx < alts.size() && alts.get(idx).length() > 0) {
            // anderes Format probieren (HLS ↔ MPEG-TS)
            triedAlt = true;
            retries = 0;
            long pos = live ? C.TIME_UNSET : player.getCurrentPosition();
            player.replaceMediaItem(idx, item(alts.get(idx), titles.get(idx)));
            player.seekTo(idx, pos);
            player.prepare();
            player.play();
            return;
        }
        lastError = e.getErrorCodeName();
        showStatus(txtFailed);
    }

    private void zap(int d) {
        if (player == null) return;
        int n = player.getMediaItemCount();
        if (n < 2) return;
        int i = (player.getCurrentMediaItemIndex() + d + n) % n;
        status.setVisibility(View.GONE);
        player.seekTo(i, C.TIME_UNSET);
        player.prepare();
        player.play();
        showInfo();
    }

    private void seekBy(long ms) {
        if (player == null || live) return;
        long dur = player.getDuration();
        long to = Math.max(0, player.getCurrentPosition() + ms);
        if (dur != C.TIME_UNSET && dur > 0) to = Math.min(to, dur - 1000);
        player.seekTo(to);
        view.showController();
    }

    @Override
    public boolean dispatchKeyEvent(KeyEvent ev) {
        if (ev.getAction() == KeyEvent.ACTION_DOWN && view != null) {
            int k = ev.getKeyCode();
            boolean controls = view.isControllerFullyVisible();
            if (live) {
                if (k == KeyEvent.KEYCODE_CHANNEL_UP || (!controls && k == KeyEvent.KEYCODE_DPAD_UP)) { zap(-1); return true; }
                if (k == KeyEvent.KEYCODE_CHANNEL_DOWN || (!controls && k == KeyEvent.KEYCODE_DPAD_DOWN)) { zap(1); return true; }
            } else if (!controls) {
                if (k == KeyEvent.KEYCODE_DPAD_RIGHT || k == KeyEvent.KEYCODE_MEDIA_FAST_FORWARD) { seekBy(30000); return true; }
                if (k == KeyEvent.KEYCODE_DPAD_LEFT || k == KeyEvent.KEYCODE_MEDIA_REWIND) { seekBy(-10000); return true; }
            }
            if (k == KeyEvent.KEYCODE_INFO || k == KeyEvent.KEYCODE_GUIDE) { showInfo(); return true; }
        }
        return super.dispatchKeyEvent(ev);
    }

    @Override
    public void onBackPressed() {
        if (view != null && view.isControllerFullyVisible()) {
            view.hideController();
            return;
        }
        finishWith();
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) hideSystemUi();
    }

    @SuppressWarnings("deprecation")
    private void hideSystemUi() {
        getWindow().getDecorView().setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                        | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                        | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION);
    }

    /* App in den Hintergrund (z. B. Home-Taste): Player schließen, damit der Zugang frei wird */
    @Override
    protected void onStop() {
        super.onStop();
        if (!isFinishing()) finishWith();
    }

    private void finishWith() {
        if (closing) return;
        closing = true;
        Intent data = new Intent();
        if (player != null) {
            data.putExtra("index", player.getCurrentMediaItemIndex());
            data.putExtra("positionMs", player.getCurrentPosition());
            long d = player.getDuration();
            data.putExtra("durationMs", d == C.TIME_UNSET ? 0L : d);
        }
        data.putExtra("ended", ended);
        if (lastError != null) data.putExtra("error", lastError);
        setResult(RESULT_OK, data);
        finish();
    }

    @Override
    protected void onDestroy() {
        handler.removeCallbacksAndMessages(null);
        if (player != null) {
            player.release();
            player = null;
        }
        super.onDestroy();
    }
}
