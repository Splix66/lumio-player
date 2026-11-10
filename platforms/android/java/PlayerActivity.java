package de.lumio.player;

import android.app.Activity;
import android.content.Intent;
import android.content.res.ColorStateList;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.graphics.drawable.StateListDrawable;
import android.media.AudioManager;
import android.media.audiofx.DynamicsProcessing;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.View;
import android.view.WindowManager;
import android.view.ViewGroup;
import android.webkit.WebSettings;
import android.widget.FrameLayout;
import android.widget.ImageView;
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
import androidx.media3.extractor.DefaultExtractorsFactory;
import androidx.media3.extractor.ts.DefaultTsPayloadReaderFactory;
import androidx.media3.ui.CaptionStyleCompat;
import androidx.media3.ui.DefaultTimeBar;
import androidx.media3.ui.PlayerView;
import androidx.media3.ui.SubtitleView;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

/**
 * Vollbild-Player auf Basis von ExoPlayer (wie bei bekannten IPTV-Apps).
 * - Live: Hoch/Runter (oder Programm +/-) schaltet um, Hänger werden automatisch neu verbunden.
 *   Ziffern 0–9 springen zur Sendernummer, „Vorheriger Sender“ zurück zum zuletzt geschauten Sender.
 * - Filme/Folgen: Links/Rechts spult, Folgen laufen automatisch weiter.
 * - Zurück schließt den Player und meldet die Position an die App.
 */
public class PlayerActivity extends Activity {

    private ExoPlayer player;
    private DynamicsProcessing sound;
    private PlayerView view;
    private TextView info;
    private TextView status;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final List<String> urls = new ArrayList<>();
    private final List<String> alts = new ArrayList<>();
    private final List<String> titles = new ArrayList<>();
    private final List<String> nums = new ArrayList<>();
    private boolean live;
    private boolean ended;
    private boolean closing;
    private int retries;
    private int hangs;               // Neuverbindungen wegen Hänger/Ende beim aktuellen Sender
    private int behindRetries;       // „hinter dem Live-Fenster“ nacheinander
    private boolean triedAlt;
    private long bufferingSince;
    private long readySince;         // seit wann der Stream ohne Unterbrechung läuft
    private String lastError;
    private String txtReconnect = "Verbindung wird wiederhergestellt …";
    private String txtFailed = "Wiedergabe nicht möglich.";
    private String txtNoChannel = "Sender {0} nicht gefunden";
    private String digits = "";      // eingetippte Sendernummer
    private int lastIdx = -1;        // vorher geschauter Sender
    private boolean bySleep;         // vom Schlaf-Timer beendet

    private final Runnable sleepEnd = new Runnable() {
        @Override
        public void run() {
            bySleep = true;
            finishWith();
        }
    };

    private final Runnable commitDigits = new Runnable() {
        @Override
        public void run() {
            jumpToNumber();
        }
    };

    private final Runnable hideStatus = new Runnable() {
        @Override
        public void run() {
            if (status != null) status.setVisibility(View.GONE);
        }
    };

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
                long now = System.currentTimeMillis();
                if (player.getPlaybackState() == Player.STATE_BUFFERING && player.getPlayWhenReady()) {
                    if (bufferingSince == 0) bufferingSince = now;
                    else if (now - bufferingSince > (live ? 10000 : 20000)) {
                        bufferingSince = 0;
                        // nicht endlos: nach 3 Hängern anderes Format probieren bzw. Fehler zeigen
                        if (++hangs > 3) failOver("hang");
                        else reconnect();
                    }
                } else {
                    bufferingSince = 0;
                    // eine Minute flüssig gelaufen: frühere Hänger zählen nicht mehr
                    if (readySince > 0 && now - readySince > 60000) hangs = 0;
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
        String t3 = in.getStringExtra("txtNoChannel");
        if (t3 != null) txtNoChannel = t3;
        long sleepAt = in.getLongExtra("sleepAt", 0L);
        if (sleepAt > System.currentTimeMillis()) handler.postDelayed(sleepEnd, sleepAt - System.currentTimeMillis());
        try {
            JSONArray arr = new JSONArray(in.getStringExtra("items"));
            for (int i = 0; i < arr.length(); i++) {
                JSONObject o = arr.getJSONObject(i);
                urls.add(o.optString("url", ""));
                alts.add(o.optString("alt", ""));
                titles.add(o.optString("title", ""));
                nums.add(o.optString("num", ""));
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
        // Live: kein Spulen um 5/15 s (ergibt bei Sendern keinen Sinn) – ⏮/⏭ schalten den Sender um
        if (live) {
            view.setShowRewindButton(false);
            view.setShowFastForwardButton(false);
        }
        root.addView(view, new FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
        styleControls();
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
            osd = visibility == View.VISIBLE;
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
        // Nach einem Hänger etwas mehr Vorrat sammeln (6 s statt 4 s), bevor es weitergeht – sonst stockt es gleich wieder
        DefaultLoadControl load = new DefaultLoadControl.Builder()
                .setBufferDurationsMs(15000, 50000, 2000, 6000)
                .build();
        // Rohe TV-Signale (.ts, „RAW“-Sender): auch ohne IDR-Schlüsselbild einsteigen und Einzelbilder selbst erkennen –
        // sonst ruckelt oder stockt das Bild bei manchen Satelliten-Sendern
        DefaultExtractorsFactory extractors = new DefaultExtractorsFactory()
                .setTsExtractorFlags(DefaultTsPayloadReaderFactory.FLAG_ALLOW_NON_IDR_KEYFRAMES | DefaultTsPayloadReaderFactory.FLAG_DETECT_ACCESS_UNITS);
        player = new ExoPlayer.Builder(this)
                .setMediaSourceFactory(new DefaultMediaSourceFactory(http, extractors))
                .setLoadControl(load)
                .build();
        view.setPlayer(player);

        List<MediaItem> items = new ArrayList<>();
        for (int i = 0; i < urls.size(); i++) items.add(item(urls.get(i), titles.get(i)));
        player.setMediaItems(items, index, live ? C.TIME_UNSET : startMs);
        // „Nächste Folge automatisch“ aus: am Ende der Folge anhalten und zurück zur Serie (dort ist die nächste markiert)
        final boolean stopAtEnd = !live && urls.size() > 1 && !in.getBooleanExtra("autoNext", true);
        if (stopAtEnd) player.setPauseAtEndOfMediaItems(true);
        // Live: beendet der Server die Verbindung (rohes .ts), denselben Sender neu verbinden
        // statt von selbst zum nächsten Sender der Liste zu springen bzw. beim letzten stehen zu bleiben
        if (live) player.setRepeatMode(Player.REPEAT_MODE_ONE);
        player.addListener(new Player.Listener() {
            @Override
            public void onPlaybackStateChanged(int state) {
                if (state != Player.STATE_READY) readySince = 0;
                if (state == Player.STATE_READY) {
                    if (readySince == 0) readySince = System.currentTimeMillis();
                    status.setVisibility(View.GONE);
                    retries = 0;
                    behindRetries = 0;
                } else if (state == Player.STATE_ENDED && !live && !closing) {
                    ended = true;
                    finishWith();
                }
            }

            @Override
            public void onPlayWhenReadyChanged(boolean playWhenReady, int reason) {
                if (stopAtEnd && !playWhenReady && reason == Player.PLAY_WHEN_READY_CHANGE_REASON_END_OF_MEDIA_ITEM && !closing) {
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
                if (reason == Player.MEDIA_ITEM_TRANSITION_REASON_REPEAT) {
                    // Live-Stream ist zu Ende gegangen und wird neu verbunden – zählt wie ein Hänger
                    if (live && ++hangs > 3) failOver("ended");
                    else if (live) showStatus(txtReconnect);
                    return;
                }
                // Austausch gegen das andere Format (PLAYLIST_CHANGED) ist kein neuer Sender – Zähler behalten
                if (reason == Player.MEDIA_ITEM_TRANSITION_REASON_PLAYLIST_CHANGED) return;
                retries = 0;
                hangs = 0;
                behindRetries = 0;
                triedAlt = false;
                showInfo();
            }
        });
        applySound(in.getStringExtra("sound"));
        player.setPlayWhenReady(true);
        player.prepare();
        showInfo();
        handler.postDelayed(watchdog, 2000);
    }

    /* Klang (Einstellungen → Wiedergabe → Klang): Android-Klangbearbeitung am Ton dieses Players (ab Android 9).
       balance: Lautstärke angleichen – leise Sender lauter, laute Werbung und Spitzen leiser
       voice:   klare Sprache – Stimmen (1–4 kHz) anheben, Bässe etwas zurück, dazu leichte Angleichung
       night:   Nachtmodus – starke Angleichung, Explosionen leiser, Flüstern lauter
       Geht etwas nicht (Gerät ohne Klangbearbeitung, Dolby-Ton direkt an die Soundbar), bleibt der Ton einfach original. */
    private void applySound(String mode) {
        if (mode == null || "off".equals(mode) || player == null || Build.VERSION.SDK_INT < Build.VERSION_CODES.P) return;
        try {
            AudioManager am = (AudioManager) getSystemService(AUDIO_SERVICE);
            int sid = am.generateAudioSessionId();
            if (sid == AudioManager.ERROR) return;
            player.setAudioSessionId(sid);
            boolean voice = "voice".equals(mode), night = "night".equals(mode);
            DynamicsProcessing.Config.Builder b = new DynamicsProcessing.Config.Builder(
                    DynamicsProcessing.VARIANT_FAVOR_FREQUENCY_RESOLUTION, 2,
                    voice, voice ? 4 : 1, true, 1, false, 1, true);
            if (voice) {
                DynamicsProcessing.Eq eq = new DynamicsProcessing.Eq(true, true, 4);
                eq.setBand(0, new DynamicsProcessing.EqBand(true, 160f, -3f));     // Bässe etwas zurück
                eq.setBand(1, new DynamicsProcessing.EqBand(true, 1000f, 0f));
                eq.setBand(2, new DynamicsProcessing.EqBand(true, 4000f, 5f));     // Sprachverständlichkeit
                eq.setBand(3, new DynamicsProcessing.EqBand(true, 20000f, 1.5f));
                b.setPreEqAllChannelsTo(eq);
            }
            DynamicsProcessing.Mbc mbc = new DynamicsProcessing.Mbc(true, true, 1);
            // ein Band über alles: Angriff, Abklingen (ms), Verhältnis, Schwelle (dB), Knie, Rauschsperre, Expander, Vor-/Nachverstärkung
            mbc.setBand(0, new DynamicsProcessing.MbcBand(true, 20000f,
                    night ? 5f : 10f, night ? 250f : 300f, night ? 6f : 3f, night ? -34f : -26f,
                    6f, -90f, 1f, 0f, night ? 12f : 7f));
            b.setMbcAllChannelsTo(mbc);
            // Begrenzer am Ende: durch die Anhebung nie übersteuern
            b.setLimiterAllChannelsTo(new DynamicsProcessing.Limiter(true, true, 0, 1f, 60f, 10f, -2f, 0f));
            sound = new DynamicsProcessing(0, sid, b.build());
            sound.setEnabled(true);
        } catch (Throwable t) {
            sound = null;
        }
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

    /* Bedienleiste im Telvo-Design statt der Media3-Standardoptik (grauer Schleier, eckiger grüner Fokusrahmen):
       Verlauf oben/unten, runde Glas-Knöpfe – gewählt weiß mit dunklem Symbol –, violette Zeitleiste.
       Die Elemente werden über ihren Namen gesucht: fehlt eines in einer anderen Media3-Version, bleibt es einfach Standard. */
    private View exo(String name) {
        int id = getResources().getIdentifier(name, "id", getPackageName());
        return id == 0 || view == null ? null : view.findViewById(id);
    }

    private StateListDrawable roundBg(boolean big) {
        StateListDrawable s = new StateListDrawable();
        GradientDrawable on = new GradientDrawable();
        on.setShape(GradientDrawable.OVAL);
        on.setColor(Color.WHITE);
        GradientDrawable off = new GradientDrawable();
        off.setShape(GradientDrawable.OVAL);
        off.setColor(big ? 0x40FFFFFF : 0x24FFFFFF);
        off.setStroke(dp(1), 0x33FFFFFF);
        s.addState(new int[] { android.R.attr.state_focused }, on);
        s.addState(new int[] { android.R.attr.state_pressed }, on);
        s.addState(new int[] {}, off);
        return s;
    }

    private void styleButton(View v, boolean big) {
        if (v == null) return;
        if (!v.isFocusable() && v instanceof ViewGroup) {
            ViewGroup g = (ViewGroup) v;
            for (int i = 0; i < g.getChildCount(); i++) styleButton(g.getChildAt(i), big);
            return;
        }
        if (!v.isFocusable()) return;
        ColorStateList ink = new ColorStateList(
                new int[][] { new int[] { android.R.attr.state_focused }, new int[] { android.R.attr.state_pressed }, new int[] {} },
                new int[] { 0xFF120F1A, 0xFF120F1A, Color.WHITE });
        v.setBackground(roundBg(big));
        if (v instanceof ImageView) ((ImageView) v).setImageTintList(ink);
        if (v instanceof TextView) {
            ((TextView) v).setTextColor(ink);
            ((TextView) v).setCompoundDrawableTintList(ink);
        }
    }

    private void styleControls() {
        try {
            View bg = exo("exo_controls_background");
            if (bg != null) bg.setBackground(new GradientDrawable(GradientDrawable.Orientation.TOP_BOTTOM,
                    new int[] { 0xB3000000, 0x1A000000, 0x00000000, 0x59000000, 0xF2000000 }));
            View bottom = exo("exo_bottom_bar");
            if (bottom != null) bottom.setBackgroundColor(Color.TRANSPARENT);
            // Abstand zum Bildschirmrand – sonst wird der runde Knopf ganz rechts (Einstellungen) angeschnitten.
            // Padding am Balken setzt Media3 selbst zurück, darum die Knopfgruppen verschieben (wirkt nur auf die Darstellung).
            for (String n : new String[] { "exo_basic_controls", "exo_extra_controls", "exo_overflow_show" }) {
                View g = exo(n);
                if (g != null) { g.setTranslationX(-dp(28)); g.setTranslationY(-dp(10)); }
            }
            View time = exo("exo_time");
            if (time != null) { time.setTranslationX(dp(12)); time.setTranslationY(-dp(10)); }
            View tb = exo("exo_progress");
            if (tb instanceof DefaultTimeBar) {
                DefaultTimeBar t = (DefaultTimeBar) tb;
                t.setPlayedColor(0xFFA855F7);
                t.setScrubberColor(Color.WHITE);
                t.setBufferedColor(0x59FFFFFF);
                t.setUnplayedColor(0x2EFFFFFF);
            }
            View pos = exo("exo_position");
            if (pos instanceof TextView) { ((TextView) pos).setTextColor(Color.WHITE); ((TextView) pos).setTypeface(Typeface.DEFAULT_BOLD); }
            View dur = exo("exo_duration");
            if (dur instanceof TextView) ((TextView) dur).setTextColor(0xB3FFFFFF);
            styleButton(exo("exo_play_pause"), true);
            for (String n : new String[] { "exo_prev", "exo_rew_with_amount", "exo_ffwd_with_amount", "exo_next",
                    "exo_subtitle", "exo_settings", "exo_overflow_show", "exo_overflow_hide", "exo_fullscreen" }) {
                styleButton(exo(n), false);
            }
        } catch (Exception e) {
            // Optik ist Nebensache – der Player muss in jedem Fall laufen
        }
    }

    private int dp(int v) {
        return Math.round(TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, getResources().getDisplayMetrics()));
    }

    private MediaItem item(String url, String title) {
        MediaItem.Builder b = new MediaItem.Builder()
                .setUri(Uri.parse(url))
                .setMediaMetadata(new MediaMetadata.Builder().setTitle(title).build());
        if (url.toLowerCase().contains(".m3u8")) b.setMimeType(MimeTypes.APPLICATION_M3U8);
        // Live: immer in normaler Geschwindigkeit – kein Beschleunigen, um zum Live-Rand aufzuholen (wirkt wie „läuft zu schnell, dann hakt es“)
        if (live) b.setLiveConfiguration(new MediaItem.LiveConfiguration.Builder().setMinPlaybackSpeed(1f).setMaxPlaybackSpeed(1f).build());
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
        if (e.errorCode == PlaybackException.ERROR_CODE_BEHIND_LIVE_WINDOW && behindRetries++ < 5) {
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
        failOver(e.getErrorCodeName());
    }

    /* Aufgeben beim aktuellen Sender: einmal das andere Format probieren (HLS ↔ MPEG-TS), sonst Fehler zeigen */
    private void failOver(String why) {
        if (player == null || closing) return;
        final int idx = player.getCurrentMediaItemIndex();
        if (!triedAlt && idx >= 0 && idx < alts.size() && alts.get(idx).length() > 0) {
            triedAlt = true;
            retries = 0;
            hangs = 0;
            long pos = live ? C.TIME_UNSET : player.getCurrentPosition();
            showStatus(txtReconnect);
            player.replaceMediaItem(idx, item(alts.get(idx), titles.get(idx)));
            player.seekTo(idx, pos);
            player.prepare();
            player.play();
            return;
        }
        lastError = why;
        player.stop();   // nicht weiter versuchen – Umschalten oder Zurück bleibt möglich
        showStatus(txtFailed);
    }

    private void zap(int d) {
        if (player == null) return;
        int n = player.getMediaItemCount();
        if (n < 2) return;
        jumpTo((player.getCurrentMediaItemIndex() + d + n) % n);
    }

    private void jumpTo(int i) {
        if (player == null || i < 0 || i >= player.getMediaItemCount()) return;
        int cur = player.getCurrentMediaItemIndex();
        if (i == cur) {
            showInfo();
            return;
        }
        lastIdx = cur;
        status.setVisibility(View.GONE);
        player.seekTo(i, C.TIME_UNSET);
        player.prepare();
        player.play();
        showInfo();
    }

    /* Sendernummer eintippen: Treffer gleich anzeigen, nach kurzer Pause (oder OK) umschalten */
    private void typeDigit(int d) {
        if (digits.length() >= 4) digits = "";
        digits += d;
        int i = nums.indexOf(String.valueOf(Integer.parseInt(digits)));
        handler.removeCallbacks(hideStatus);
        showStatus(i >= 0 && i < titles.size() ? titles.get(i) : digits);
        handler.removeCallbacks(commitDigits);
        handler.postDelayed(commitDigits, 1800);
    }

    private void jumpToNumber() {
        handler.removeCallbacks(commitDigits);
        if (digits.isEmpty()) return;
        String n = String.valueOf(Integer.parseInt(digits));
        digits = "";
        int i = nums.indexOf(n);
        if (i < 0) {
            showStatus(txtNoChannel.replace("{0}", n));
            handler.postDelayed(hideStatus, 1600);
            return;
        }
        status.setVisibility(View.GONE);
        jumpTo(i);
    }

    private void seekBy(long ms) {
        if (player == null || live) return;
        long dur = player.getDuration();
        long to = Math.max(0, player.getCurrentPosition() + ms);
        if (dur != C.TIME_UNSET && dur > 0) to = Math.min(to, dur - 1000);
        player.seekTo(to);
        view.showController();
    }

    /* Taste, deren Drücken der Player selbst verarbeitet hat (Umschalten, Spulen, Ziffern). Auch das Loslassen
       wird dann geschluckt: Der PlayerView blendet sonst bei jedem Steuerkreuz-Ereignis die Bedienleiste ein,
       und solange sie sichtbar ist, schaltet hoch/runter nicht mehr um (nur jeder zweite Druck wirkte). */
    private int consumedKey = -1;
    /* Bedienleiste sichtbar (auch während sie sich gerade aus- oder einblendet). isControllerFullyVisible() ist in
       dieser Phase false – dann wurde RECHTS als „+30 s spulen“ abgefangen statt zum nächsten Knopf (⏭) zu springen. */
    private boolean osd = false;

    @Override
    public boolean dispatchKeyEvent(KeyEvent ev) {
        int k = ev.getKeyCode();
        if (ev.getAction() == KeyEvent.ACTION_UP && k == consumedKey) {
            consumedKey = -1;
            return true;
        }
        if (ev.getAction() == KeyEvent.ACTION_DOWN && view != null && handleKey(k)) {
            consumedKey = k;
            return true;
        }
        // In der Leiste navigieren: Ausblende-Zeit neu starten, sonst verschwindet sie mitten im Wählen (nach 4 s)
        if (ev.getAction() == KeyEvent.ACTION_DOWN && view != null && osd && isNavKey(k)) view.showController();
        return super.dispatchKeyEvent(ev);
    }

    private static boolean isNavKey(int k) {
        return k == KeyEvent.KEYCODE_DPAD_LEFT || k == KeyEvent.KEYCODE_DPAD_RIGHT || k == KeyEvent.KEYCODE_DPAD_UP
                || k == KeyEvent.KEYCODE_DPAD_DOWN || k == KeyEvent.KEYCODE_DPAD_CENTER || k == KeyEvent.KEYCODE_ENTER;
    }

    private boolean handleKey(int k) {
        boolean controls = osd || view.isControllerFullyVisible();
        if (live) {
            if (k >= KeyEvent.KEYCODE_0 && k <= KeyEvent.KEYCODE_9) { typeDigit(k - KeyEvent.KEYCODE_0); return true; }
            if (k >= KeyEvent.KEYCODE_NUMPAD_0 && k <= KeyEvent.KEYCODE_NUMPAD_9) { typeDigit(k - KeyEvent.KEYCODE_NUMPAD_0); return true; }
            if (!digits.isEmpty() && (k == KeyEvent.KEYCODE_DPAD_CENTER || k == KeyEvent.KEYCODE_ENTER)) { jumpToNumber(); return true; }
            if (k == KeyEvent.KEYCODE_LAST_CHANNEL) { if (lastIdx >= 0) jumpTo(lastIdx); return true; }
            if (k == KeyEvent.KEYCODE_CHANNEL_UP || (!controls && k == KeyEvent.KEYCODE_DPAD_UP)) { zap(-1); return true; }
            if (k == KeyEvent.KEYCODE_CHANNEL_DOWN || (!controls && k == KeyEvent.KEYCODE_DPAD_DOWN)) { zap(1); return true; }
        } else if (!controls) {
            if (k == KeyEvent.KEYCODE_DPAD_RIGHT || k == KeyEvent.KEYCODE_MEDIA_FAST_FORWARD) { seekBy(30000); return true; }
            if (k == KeyEvent.KEYCODE_DPAD_LEFT || k == KeyEvent.KEYCODE_MEDIA_REWIND) { seekBy(-10000); return true; }
        }
        if (k == KeyEvent.KEYCODE_INFO || k == KeyEvent.KEYCODE_GUIDE) { showInfo(); return true; }
        return false;
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
            // Verbindung sofort freigeben (release folgt erst in onDestroy, das kann Sekunden dauern) –
            // sonst lehnen Zugänge mit nur einer Verbindung die Vorschau in der App ab
            player.stop();
        }
        data.putExtra("ended", ended);
        data.putExtra("sleep", bySleep);
        if (lastError != null) data.putExtra("error", lastError);
        setResult(RESULT_OK, data);
        finish();
    }

    @Override
    protected void onDestroy() {
        handler.removeCallbacksAndMessages(null);
        if (sound != null) {
            try { sound.release(); } catch (Exception ignored) { }
            sound = null;
        }
        if (player != null) {
            player.release();
            player = null;
        }
        super.onDestroy();
    }
}
