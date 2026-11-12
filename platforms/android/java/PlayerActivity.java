package de.lumio.player;

import android.app.Activity;
import android.content.Intent;
import android.content.res.ColorStateList;
import android.graphics.Bitmap;
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
import android.util.Log;
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
import androidx.media3.common.Format;
import androidx.media3.common.TrackSelectionOverride;
import androidx.media3.common.Tracks;
import androidx.media3.ui.AspectRatioFrameLayout;
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
    private View info;               // Sender-Banner (unten links)
    private ImageView bLogo;
    private TextView bLogoNum, bNum, bName, bClock, bNow, bStart, bEnd, bNext;
    private View bBarRow, bFill, bRest;
    private final List<String> names = new ArrayList<>();
    private final List<String> logos = new ArrayList<>();
    private final List<JSONArray> epgs = new ArrayList<>();
    private final List<String> epgUrls = new ArrayList<>();
    private final java.util.Set<Integer> epgLoading = new java.util.HashSet<>();
    private long epgShift;           // Programm-Verschiebung in Sekunden (Einstellung der Playlist)
    private final java.util.Map<String, Bitmap> logoCache = new java.util.HashMap<>();
    private final java.util.concurrent.ExecutorService io = java.util.concurrent.Executors.newSingleThreadExecutor();
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
    private long stuckPos = -1;      // Wiedergabeposition beim letzten Blick des Wächters
    private long stuckSince;         // seit wann sich die Position nicht mehr bewegt
    private long zapAt;              // Zeitpunkt des Umschaltens (für das Protokoll „bereit nach … ms“)
    private String lastError;
    private String txtReconnect = "Verbindung wird wiederhergestellt …";
    private String txtFailed = "Wiedergabe nicht möglich.";
    private String txtNoChannel = "Sender {0} nicht gefunden";
    private String txtNext = "Danach";
    private JSONObject menuTexts;    // Texte des Einstellungsmenüs in der App-Sprache
    private java.util.Locale appLocale = java.util.Locale.getDefault();
    private FrameLayout menuLayer;
    private android.widget.LinearLayout menuMain, menuSub;
    private int menuSubKind = -1;    // offene Auswahl: 0 Tonspur, 1 Untertitel, 2 Bildformat, 3 Geschwindigkeit
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

    /* Protokoll (adb logcat -s TelvoPlayer): Trennungen, Fehler und Neuverbindungen – für die Fehlersuche auf echten Geräten */
    private static final String TAG = "TelvoPlayer";

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
                    // Bereit und soll laufen, aber die Zeit steht (Quelle liefert kein Bild – schwarz bei 00:00):
                    // anderes Format probieren bzw. „Wiedergabe nicht möglich“ zeigen statt endlos schwarz
                    if (player.getPlaybackState() == Player.STATE_READY && player.getPlayWhenReady()) {
                        long pos = player.getCurrentPosition();
                        if (pos != stuckPos) { stuckPos = pos; stuckSince = now; }
                        else if (now - stuckSince > (live ? 15000 : 20000)) { stuckPos = -1; failOver("stuck"); }
                    } else {
                        stuckPos = -1;
                    }
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
        String t4 = in.getStringExtra("txtNext");
        if (t4 != null) txtNext = t4;
        epgShift = in.getLongExtra("epgShift", 0L);
        try { String mt = in.getStringExtra("menuTexts"); if (mt != null) menuTexts = new JSONObject(mt); } catch (Exception ignored) { }
        String al = in.getStringExtra("lang");
        if (al != null && al.length() >= 2) appLocale = new java.util.Locale(al);
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
                names.add(o.optString("name", ""));
                logos.add(o.optString("logo", ""));
                epgs.add(o.optJSONArray("epg"));
                epgUrls.add(o.optString("epgUrl", ""));
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

        info = buildBanner();
        info.setVisibility(View.GONE);
        FrameLayout.LayoutParams lpInfo = new FrameLayout.LayoutParams(FrameLayout.LayoutParams.WRAP_CONTENT, FrameLayout.LayoutParams.WRAP_CONTENT, Gravity.BOTTOM | Gravity.START);
        lpInfo.setMargins(dp(40), 0, dp(40), dp(32));
        root.addView(info, lpInfo);

        buildMenu(root);
        // Bildformat wie zuletzt gewählt (Original, Zoom, Strecken)
        view.setResizeMode(getSharedPreferences("telvo_player", MODE_PRIVATE).getInt("resize", AspectRatioFrameLayout.RESIZE_MODE_FIT));

        status = makeLabel(20);
        status.setVisibility(View.GONE);
        root.addView(status, new FrameLayout.LayoutParams(FrameLayout.LayoutParams.WRAP_CONTENT, FrameLayout.LayoutParams.WRAP_CONTENT, Gravity.CENTER));

        setContentView(root);
        hideSystemUi();

        view.setControllerVisibilityListener((PlayerView.ControllerVisibilityListener) visibility -> {
            osd = visibility == View.VISIBLE;
            // Bedienleiste unten offen: Banner darüber schieben statt sie zu verdecken
            info.setTranslationY(visibility == View.VISIBLE ? -dp(96) : 0);
            if (visibility == View.VISIBLE) {
                handler.removeCallbacks(hideInfo);
                showInfo();
                handler.removeCallbacks(hideInfo);
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
        // Nach einem Hänger etwas mehr Vorrat sammeln (6 s statt 4 s), bevor es weitergeht – sonst stockt es gleich wieder.
        // (1 s statt 2 s beim Start wurde gemessen: kein Gewinn – der Player ist schon vor dem ersten Bild bereit.)
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
                    if (zapAt > 0) { Log.i(TAG, "bereit nach " + (System.currentTimeMillis() - zapAt) + " ms"); zapAt = 0; }
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
                    if (live) Log.i(TAG, "live: Server hat getrennt, neu verbinden (" + (hangs + 1) + ")");
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
            if (sound.setEnabled(true) != android.media.audiofx.AudioEffect.SUCCESS) throw new IllegalStateException("sound");
        } catch (Throwable t) {
            // Effekt erzeugt, aber nicht nutzbar (z. B. Fire OS): wieder freigeben, sonst hängt er an der Audio-Session
            if (sound != null) { try { sound.release(); } catch (Throwable ignored) { } }
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
            // Zahnrad und Untertitel-Knopf öffnen das eigene Menü (statt des Media3-Menüs: lag über den Knöpfen,
            // Standard-Optik, Texte in der Systemsprache statt der App-Sprache)
            View gear = exo("exo_settings");
            if (gear != null) gear.setOnClickListener(v -> openMenu(-1));
            View cc = exo("exo_subtitle");
            if (cc != null) cc.setOnClickListener(v -> openMenu(1));
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

    /* Sender-Banner: Logo, Nummer, Name, Uhrzeit – bei Live mit Programmdaten dazu laufende Sendung, Fortschritt und
       „Danach“. Glas wie in der App (dunkel, leicht durchscheinend, feiner heller Rand), Fortschritt violett. */
    private TextView text(int sp, int color, boolean bold) {
        TextView t = new TextView(this);
        t.setTextColor(color);
        t.setTextSize(TypedValue.COMPLEX_UNIT_SP, sp);
        if (bold) t.setTypeface(Typeface.DEFAULT_BOLD);
        t.setSingleLine(true);
        t.setEllipsize(android.text.TextUtils.TruncateAt.END);
        return t;
    }

    private View buildBanner() {
        final int dim = 0x99FFFFFF;
        android.widget.LinearLayout box = new android.widget.LinearLayout(this);
        box.setOrientation(android.widget.LinearLayout.HORIZONTAL);
        box.setGravity(Gravity.CENTER_VERTICAL);
        box.setPadding(dp(16), dp(14), dp(20), dp(14));
        GradientDrawable bg = new GradientDrawable();
        bg.setColor(0xD914141A);
        bg.setCornerRadius(dp(16));
        bg.setStroke(dp(1), 0x26FFFFFF);
        box.setBackground(bg);

        FrameLayout logoBox = new FrameLayout(this);
        GradientDrawable lb = new GradientDrawable();
        // helles Glas statt Weiß: viele Senderlogos sind weiß auf durchsichtigem Grund und wären auf Weiß unsichtbar
        lb.setColor(0x24FFFFFF);
        lb.setStroke(dp(1), 0x1FFFFFFF);
        lb.setCornerRadius(dp(12));
        logoBox.setBackground(lb);
        bLogo = new ImageView(this);
        bLogo.setScaleType(ImageView.ScaleType.FIT_CENTER);
        bLogo.setPadding(dp(7), dp(7), dp(7), dp(7));
        logoBox.addView(bLogo, new FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
        bLogoNum = text(17, Color.WHITE, true);
        bLogoNum.setGravity(Gravity.CENTER);
        logoBox.addView(bLogoNum, new FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
        android.widget.LinearLayout.LayoutParams lpLogo = new android.widget.LinearLayout.LayoutParams(dp(64), dp(64));
        lpLogo.setMarginEnd(dp(16));
        box.addView(logoBox, lpLogo);

        android.widget.LinearLayout col = new android.widget.LinearLayout(this);
        col.setOrientation(android.widget.LinearLayout.VERTICAL);
        // Spalte füllt die feste Bannerbreite – so steht die Uhrzeit auch im schmalen Banner rechts am Rand
        box.addView(col, new android.widget.LinearLayout.LayoutParams(0, android.widget.LinearLayout.LayoutParams.WRAP_CONTENT, 1f));

        android.widget.LinearLayout top = new android.widget.LinearLayout(this);
        top.setOrientation(android.widget.LinearLayout.HORIZONTAL);
        top.setGravity(Gravity.CENTER_VERTICAL);
        bNum = text(14, dim, false);
        bName = text(20, Color.WHITE, true);
        bName.setMaxWidth(getResources().getDisplayMetrics().widthPixels * 2 / 5);
        bClock = text(13, dim, false);
        android.widget.LinearLayout.LayoutParams lpNum = new android.widget.LinearLayout.LayoutParams(-2, -2);
        lpNum.setMarginEnd(dp(10));
        top.addView(bNum, lpNum);
        top.addView(bName, new android.widget.LinearLayout.LayoutParams(0, -2, 1f));
        android.widget.LinearLayout.LayoutParams lpClock = new android.widget.LinearLayout.LayoutParams(-2, -2);
        lpClock.setMarginStart(dp(16));
        top.addView(bClock, lpClock);
        col.addView(top, new android.widget.LinearLayout.LayoutParams(-1, -2));

        bNow = text(15, Color.WHITE, false);
        android.widget.LinearLayout.LayoutParams lpNow = new android.widget.LinearLayout.LayoutParams(-1, -2);
        lpNow.topMargin = dp(4);
        col.addView(bNow, lpNow);

        android.widget.LinearLayout bar = new android.widget.LinearLayout(this);
        bar.setOrientation(android.widget.LinearLayout.HORIZONTAL);
        bar.setGravity(Gravity.CENTER_VERTICAL);
        bStart = text(13, dim, false);
        bEnd = text(13, dim, false);
        // Leiste: violett gelaufen, Rest deutlich hell (auch auf dunklen Fernsehern gut sichtbar)
        android.widget.LinearLayout track = new android.widget.LinearLayout(this);
        track.setOrientation(android.widget.LinearLayout.HORIZONTAL);
        GradientDrawable tr = new GradientDrawable();
        tr.setColor(0x52FFFFFF);
        tr.setCornerRadius(dp(3));
        track.setBackground(tr);
        bFill = new View(this);
        GradientDrawable fl = new GradientDrawable();
        fl.setColor(0xFFA855F7);
        fl.setCornerRadius(dp(3));
        bFill.setBackground(fl);
        bRest = new View(this);
        track.addView(bFill, new android.widget.LinearLayout.LayoutParams(0, -1, 0f));
        track.addView(bRest, new android.widget.LinearLayout.LayoutParams(0, -1, 1f));
        android.widget.LinearLayout.LayoutParams lpS = new android.widget.LinearLayout.LayoutParams(-2, -2);
        lpS.setMarginEnd(dp(10));
        bar.addView(bStart, lpS);
        bar.addView(track, new android.widget.LinearLayout.LayoutParams(0, dp(5), 1f));
        android.widget.LinearLayout.LayoutParams lpE = new android.widget.LinearLayout.LayoutParams(-2, -2);
        lpE.setMarginStart(dp(10));
        bar.addView(bEnd, lpE);
        bBarRow = bar;
        android.widget.LinearLayout.LayoutParams lpBar = new android.widget.LinearLayout.LayoutParams(-1, -2);
        lpBar.topMargin = dp(6);
        col.addView(bar, lpBar);

        bNext = text(13, dim, false);
        android.widget.LinearLayout.LayoutParams lpNext = new android.widget.LinearLayout.LayoutParams(-1, -2);
        lpNext.topMargin = dp(6);
        col.addView(bNext, lpNext);
        return box;
    }

    private static String hhmm(long sec) {
        return new java.text.SimpleDateFormat("HH:mm", java.util.Locale.getDefault()).format(new java.util.Date(sec * 1000L));
    }

    private void showInfo() {
        if (player == null || info == null) return;
        int i = player.getCurrentMediaItemIndex();
        if (i < 0 || i >= titles.size()) return;
        String name = i < names.size() && names.get(i).length() > 0 ? names.get(i) : titles.get(i);
        String num = live ? nums.get(i) : "";
        bNum.setText(num);
        bNum.setVisibility(num.length() > 0 ? View.VISIBLE : View.GONE);
        bName.setText(name);
        bClock.setText(hhmm(System.currentTimeMillis() / 1000L));

        // Programmdaten (nur Live): [[Titel, Start, Ende], …] in Sekunden
        JSONArray ep = live && i < epgs.size() ? epgs.get(i) : null;
        long now = System.currentTimeMillis() / 1000L;
        JSONArray cur = null, next = null;
        if (ep != null) {
            for (int k = 0; k < ep.length(); k++) {
                JSONArray e = ep.optJSONArray(k);
                if (e == null) continue;
                long s = e.optLong(1), en = e.optLong(2);
                if (cur == null && s <= now && en > now) cur = e;
                else if (cur != null && s >= cur.optLong(2) - 1) { next = e; break; }
            }
        }
        if (cur != null) {
            long s = cur.optLong(1), en = cur.optLong(2);
            bNow.setText(cur.optString(0));
            bStart.setText(hhmm(s));
            bEnd.setText(hhmm(en));
            float pct = en > s ? Math.max(0f, Math.min(1f, (now - s) / (float) (en - s))) : 0f;
            ((android.widget.LinearLayout.LayoutParams) bFill.getLayoutParams()).weight = pct;
            ((android.widget.LinearLayout.LayoutParams) bRest.getLayoutParams()).weight = 1f - pct;
            bFill.requestLayout();
            bNow.setVisibility(View.VISIBLE);
            bBarRow.setVisibility(View.VISIBLE);
            bNext.setText(next != null ? txtNext + "  " + hhmm(next.optLong(1)) + "  " + next.optString(0) : "");
            bNext.setVisibility(next != null ? View.VISIBLE : View.GONE);
        } else {
            bNow.setVisibility(View.GONE);
            bBarRow.setVisibility(View.GONE);
            bNext.setVisibility(View.GONE);
            if (live) loadEpg(i);   // fehlt bzw. veraltet: beim Anbieter holen, Banner wird dann ergänzt
        }
        // Feste Breite wie im Entwurf: mit Programmdaten gut die Hälfte des Bildes, ohne schmal (nur Logo, Nummer, Name)
        int w = getResources().getDisplayMetrics().widthPixels * (cur != null ? 50 : 34) / 100;
        if (info.getLayoutParams() != null && info.getLayoutParams().width != w) {
            info.getLayoutParams().width = w;
            info.requestLayout();
        }

        // Logo: sofort Platzhalter (Nummer bzw. Anfangsbuchstaben), Bild lädt im Hintergrund nach
        View logoBox = (View) bLogo.getParent();
        String logo = i < logos.size() ? logos.get(i) : "";
        if (!live) {
            logoBox.setVisibility(View.GONE);
        } else {
            logoBox.setVisibility(View.VISIBLE);
            String ph = num.length() > 0 ? num : (name.length() > 3 ? name.substring(0, 3) : name);
            bLogoNum.setText(ph);
            Bitmap b = logo.length() > 0 ? logoCache.get(logo) : null;
            bLogo.setTag(logo);
            bLogo.setImageBitmap(b);
            bLogoNum.setVisibility(b == null ? View.VISIBLE : View.GONE);
            if (b == null && logo.startsWith("http")) loadLogo(logo);
        }

        info.setVisibility(View.VISIBLE);
        handler.removeCallbacks(hideInfo);
        handler.postDelayed(hideInfo, 4000);
    }

    /* Programmdaten eines Senders beim Anbieter holen (Xtream: get_short_epg) – einmal je Sender und Sitzung,
       erneut nur wenn die geholten Sendungen schon vorbei sind. Titel kommen Base64-kodiert. */
    private void loadEpg(final int idx) {
        if (idx < 0 || idx >= epgUrls.size()) return;
        final String url = epgUrls.get(idx);
        if (url.length() == 0 || epgLoading.contains(idx)) return;
        epgLoading.add(idx);
        try {
            io.execute(() -> {
                JSONArray out = new JSONArray();
                try {
                    java.net.HttpURLConnection c = (java.net.HttpURLConnection) new java.net.URL(url).openConnection();
                    c.setConnectTimeout(5000);
                    c.setReadTimeout(8000);
                    java.io.InputStream s = c.getInputStream();
                    java.io.ByteArrayOutputStream bo = new java.io.ByteArrayOutputStream();
                    byte[] buf = new byte[8192];
                    int n;
                    while ((n = s.read(buf)) > 0 && bo.size() < 2_000_000) bo.write(buf, 0, n);
                    s.close();
                    c.disconnect();
                    JSONArray l = new JSONObject(bo.toString("UTF-8")).optJSONArray("epg_listings");
                    long now = System.currentTimeMillis() / 1000L;
                    for (int k = 0; l != null && k < l.length() && out.length() < 4; k++) {
                        JSONObject e = l.optJSONObject(k);
                        if (e == null) continue;
                        long st = e.optLong("start_timestamp") + epgShift, en = e.optLong("stop_timestamp") + epgShift;
                        if (en <= now) continue;
                        String t = e.optString("title", "");
                        try { t = new String(android.util.Base64.decode(t, android.util.Base64.DEFAULT), "UTF-8"); } catch (Throwable ignored) { }
                        out.put(new JSONArray().put(t.trim()).put(st).put(en));
                    }
                } catch (Throwable ignored) { }
                final JSONArray res = out;
                handler.post(() -> {
                    if (closing) return;
                    // nichts gefunden: nicht sofort erneut fragen; gefunden: nach Ablauf der Sendungen darf neu geholt werden
                    if (res.length() > 0) {
                        if (idx < epgs.size()) epgs.set(idx, res);
                        epgLoading.remove(idx);
                        if (player != null && player.getCurrentMediaItemIndex() == idx && info != null && info.getVisibility() == View.VISIBLE) refreshInfo();
                    }
                });
            });
        } catch (Throwable ignored) { epgLoading.remove(idx); }
    }

    /* Banner neu befüllen, ohne die Anzeigedauer zu verlängern */
    private void refreshInfo() {
        boolean vis = info.getVisibility() == View.VISIBLE;
        showInfo();
        if (vis && (view == null || !view.isControllerFullyVisible())) {
            handler.removeCallbacks(hideInfo);
            handler.postDelayed(hideInfo, 3000);
        }
    }

    /* ---------- Einstellungsmenü (Zahnrad): Tonspur, Untertitel, Bildformat, Geschwindigkeit ----------
       Glasfläche rechts am Rand; eine Auswahl klappt links daneben auf. Gewählt = weiß mit dunkler Schrift wie die
       Knöpfe, aktive Wahl mit violettem Haken. Texte kommen aus der App (menuTexts), nicht aus der Systemsprache. */
    private String mt(String k, String def) { return menuTexts != null ? menuTexts.optString(k, def) : def; }

    private boolean menuOpen() { return menuLayer != null && menuLayer.getVisibility() == View.VISIBLE; }

    private android.widget.LinearLayout menuPanel() {
        android.widget.LinearLayout p = new android.widget.LinearLayout(this);
        p.setOrientation(android.widget.LinearLayout.VERTICAL);
        p.setPadding(dp(12), dp(12), dp(12), dp(12));
        GradientDrawable bg = new GradientDrawable();
        bg.setColor(0xE014141A);
        bg.setCornerRadius(dp(16));
        bg.setStroke(dp(1), 0x24FFFFFF);
        p.setBackground(bg);
        return p;
    }

    private void buildMenu(FrameLayout root) {
        int w = getResources().getDisplayMetrics().widthPixels;
        menuLayer = new FrameLayout(this);
        menuLayer.setVisibility(View.GONE);
        menuMain = menuPanel();
        FrameLayout.LayoutParams lm = new FrameLayout.LayoutParams(w * 30 / 100, FrameLayout.LayoutParams.WRAP_CONTENT, Gravity.END | Gravity.CENTER_VERTICAL);
        lm.setMargins(0, 0, dp(40), 0);
        menuLayer.addView(menuMain, lm);
        menuSub = menuPanel();
        menuSub.setVisibility(View.GONE);
        FrameLayout.LayoutParams ls = new FrameLayout.LayoutParams(w * 24 / 100, FrameLayout.LayoutParams.WRAP_CONTENT, Gravity.END | Gravity.CENTER_VERTICAL);
        ls.setMargins(0, 0, dp(40) + w * 30 / 100 + dp(14), 0);
        menuLayer.addView(menuSub, ls);
        root.addView(menuLayer, new FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
    }

    private TextView menuHead(String t) {
        TextView h = text(13, 0x8CFFFFFF, false);
        h.setText(t);
        h.setPadding(dp(10), dp(2), dp(10), dp(8));
        return h;
    }

    /* Eine Zeile: Titel, darunter der aktuelle Wert (Hauptmenü) bzw. Haken + Name (Auswahl) */
    private View menuRow(String title, String value, boolean enabled, Boolean checked, final Runnable onClick) {
        android.widget.LinearLayout r = new android.widget.LinearLayout(this);
        r.setOrientation(android.widget.LinearLayout.HORIZONTAL);
        r.setGravity(Gravity.CENTER_VERTICAL);
        r.setPadding(dp(12), dp(10), dp(12), dp(10));
        StateListDrawable s = new StateListDrawable();
        GradientDrawable on = new GradientDrawable();
        on.setColor(Color.WHITE);
        on.setCornerRadius(dp(10));
        s.addState(new int[] { android.R.attr.state_focused }, on);
        s.addState(new int[] {}, new GradientDrawable());
        r.setBackground(s);
        r.setFocusable(enabled);
        r.setClickable(enabled);
        if (checked != null) {
            TextView ck = text(16, 0xFFA855F7, true);
            ck.setText(checked ? "✓" : "");
            ck.setDuplicateParentStateEnabled(true);
            r.addView(ck, new android.widget.LinearLayout.LayoutParams(dp(24), -2));
        }
        android.widget.LinearLayout col = new android.widget.LinearLayout(this);
        col.setOrientation(android.widget.LinearLayout.VERTICAL);
        col.setDuplicateParentStateEnabled(true);
        TextView t = text(16, Color.WHITE, checked == null);
        t.setText(title);
        t.setDuplicateParentStateEnabled(true);
        t.setTextColor(new ColorStateList(new int[][] { new int[] { android.R.attr.state_focused }, new int[] {} },
                new int[] { 0xFF120F1A, enabled ? Color.WHITE : 0x66FFFFFF }));
        col.addView(t);
        if (value != null && value.length() > 0) {
            TextView v = text(13, 0x99FFFFFF, false);
            v.setText(value);
            v.setDuplicateParentStateEnabled(true);
            v.setTextColor(new ColorStateList(new int[][] { new int[] { android.R.attr.state_focused }, new int[] {} },
                    new int[] { 0xFF4B4658, enabled ? 0x99FFFFFF : 0x59FFFFFF }));
            col.addView(v);
        }
        r.addView(col, new android.widget.LinearLayout.LayoutParams(0, -2, 1f));
        if (checked == null && enabled) {
            TextView ar = text(18, Color.WHITE, false);
            ar.setText("›");
            ar.setDuplicateParentStateEnabled(true);
            ar.setTextColor(new ColorStateList(new int[][] { new int[] { android.R.attr.state_focused }, new int[] {} }, new int[] { 0xFF120F1A, 0x99FFFFFF }));
            r.addView(ar);
        }
        if (enabled) r.setOnClickListener(v -> onClick.run());
        return r;
    }

    private String trackName(Format f, boolean audio) {
        String name = f.label;
        if (name == null || name.trim().length() == 0) {
            String l = f.language;
            if (l != null && l.length() > 0 && !"und".equals(l)) {
                name = new java.util.Locale(l).getDisplayLanguage(appLocale);
                if (name.length() > 0) name = name.substring(0, 1).toUpperCase(appLocale) + name.substring(1);
            } else name = mt("unknown", "Unbekannt");
        }
        if (!audio) return name;
        String ch = f.channelCount == 1 ? "Mono" : f.channelCount == 2 ? "Stereo" : f.channelCount == 6 ? "5.1" : f.channelCount == 8 ? "7.1" : "";
        String mime = f.sampleMimeType != null ? f.sampleMimeType : "";
        String extra = (mime.contains("ac3") || mime.contains("eac3") || mime.contains("ac4")) ? ("Dolby" + (ch.length() > 0 ? " " + ch : "")) : ch;
        return extra.length() > 0 ? name + " · " + extra : name;
    }

    /* Spuren eines Typs: [Gruppe, Index, Name, gewählt?] */
    private List<Object[]> tracksOf(int type) {
        List<Object[]> out = new ArrayList<>();
        if (player == null) return out;
        for (Tracks.Group g : player.getCurrentTracks().getGroups()) {
            if (g.getType() != type) continue;
            for (int i = 0; i < g.length; i++) {
                if (!g.isTrackSupported(i)) continue;
                out.add(new Object[] { g, i, trackName(g.getTrackFormat(i), type == C.TRACK_TYPE_AUDIO), g.isTrackSelected(i) });
            }
        }
        return out;
    }

    private String selectedName(int type, String none) {
        for (Object[] t : tracksOf(type)) if ((Boolean) t[3]) return (String) t[2];
        return none;
    }

    private static final int[] RESIZE = { AspectRatioFrameLayout.RESIZE_MODE_FIT, AspectRatioFrameLayout.RESIZE_MODE_ZOOM, AspectRatioFrameLayout.RESIZE_MODE_FILL };
    private String[] resizeNames() { return new String[] { mt("fit", "Original"), mt("zoom", "Zoom"), mt("fill", "Strecken") }; }
    private static final float[] SPEEDS = { 0.75f, 1f, 1.25f, 1.5f, 2f };
    private String speedName(float s) { return s == 1f ? mt("normal", "Normal") : (String.valueOf(s).replace(".0", "").replace('.', ',') + "×"); }

    private void fillMain() {
        menuMain.removeAllViews();
        menuMain.addView(menuHead(mt("title", "Wiedergabe")));
        menuMain.addView(menuRow(mt("audio", "Tonspur"), selectedName(C.TRACK_TYPE_AUDIO, mt("auto", "Automatisch")), !tracksOf(C.TRACK_TYPE_AUDIO).isEmpty(), null, () -> openSub(0)));
        boolean subsOff = player != null && player.getTrackSelectionParameters().disabledTrackTypes.contains(C.TRACK_TYPE_TEXT);
        menuMain.addView(menuRow(mt("subs", "Untertitel"), subsOff ? mt("off", "Aus") : selectedName(C.TRACK_TYPE_TEXT, mt("off", "Aus")), !tracksOf(C.TRACK_TYPE_TEXT).isEmpty(), null, () -> openSub(1)));
        int rm = view.getResizeMode(), ri = 0;
        for (int i = 0; i < RESIZE.length; i++) if (RESIZE[i] == rm) ri = i;
        menuMain.addView(menuRow(mt("format", "Bildformat"), resizeNames()[ri], true, null, () -> openSub(2)));
        menuMain.addView(menuRow(mt("speed", "Geschwindigkeit"), live ? mt("onlyMovies", "Nur bei Filmen") : speedName(player != null ? player.getPlaybackParameters().speed : 1f), !live, null, () -> openSub(3)));
    }

    private void focusMain(int kind) {
        // Zeile 0 ist die Überschrift
        int i = kind >= 0 ? kind + 1 : 1;
        View v = i < menuMain.getChildCount() ? menuMain.getChildAt(i) : null;
        if (v == null || !v.isFocusable()) for (int k = 1; k < menuMain.getChildCount(); k++) if (menuMain.getChildAt(k).isFocusable()) { v = menuMain.getChildAt(k); break; }
        if (v != null) v.requestFocus();
    }

    private void openMenu(int kind) {
        if (menuLayer == null || player == null) return;
        view.hideController();
        fillMain();
        menuSub.setVisibility(View.GONE);
        menuSubKind = -1;
        menuLayer.setVisibility(View.VISIBLE);
        menuLayer.bringToFront();
        if (kind >= 0 && menuMain.getChildAt(kind + 1) != null && menuMain.getChildAt(kind + 1).isFocusable()) openSub(kind);
        else focusMain(-1);
    }

    private void closeMenu() {
        if (menuLayer == null) return;
        menuLayer.setVisibility(View.GONE);
        menuSub.setVisibility(View.GONE);
        menuSubKind = -1;
    }

    /* Nach einer Wahl: Auswahl schließen, Hauptmenü mit neuem Wert, Fokus zurück auf die Zeile */
    private void chosen(int kind) {
        menuSub.setVisibility(View.GONE);
        menuSubKind = -1;
        fillMain();
        focusMain(kind);
    }

    private void openSub(final int kind) {
        menuSub.removeAllViews();
        menuSubKind = kind;
        View sel = null;
        if (kind == 0 || kind == 1) {
            final int type = kind == 0 ? C.TRACK_TYPE_AUDIO : C.TRACK_TYPE_TEXT;
            menuSub.addView(menuHead(kind == 0 ? mt("audio", "Tonspur") : mt("subs", "Untertitel")));
            boolean off = player.getTrackSelectionParameters().disabledTrackTypes.contains(type);
            if (kind == 1) {
                View r = menuRow(mt("off", "Aus"), null, true, off, () -> {
                    player.setTrackSelectionParameters(player.getTrackSelectionParameters().buildUpon()
                            .clearOverridesOfType(C.TRACK_TYPE_TEXT).setTrackTypeDisabled(C.TRACK_TYPE_TEXT, true).build());
                    chosen(1);
                });
                menuSub.addView(r);
                if (off) sel = r;
            }
            for (Object[] t : tracksOf(type)) {
                final Tracks.Group g = (Tracks.Group) t[0];
                final int idx = (Integer) t[1];
                boolean on = !off && (Boolean) t[3];
                View r = menuRow((String) t[2], null, true, on, () -> {
                    player.setTrackSelectionParameters(player.getTrackSelectionParameters().buildUpon()
                            .setTrackTypeDisabled(type, false)
                            .setOverrideForType(new TrackSelectionOverride(g.getMediaTrackGroup(), idx)).build());
                    chosen(kind);
                });
                menuSub.addView(r);
                if (on && sel == null) sel = r;
            }
        } else if (kind == 2) {
            menuSub.addView(menuHead(mt("format", "Bildformat")));
            String[] names = resizeNames();
            for (int i = 0; i < RESIZE.length; i++) {
                final int m = RESIZE[i];
                boolean on = view.getResizeMode() == m;
                View r = menuRow(names[i], null, true, on, () -> {
                    view.setResizeMode(m);
                    getSharedPreferences("telvo_player", MODE_PRIVATE).edit().putInt("resize", m).apply();
                    chosen(2);
                });
                menuSub.addView(r);
                if (on) sel = r;
            }
        } else if (kind == 3) {
            menuSub.addView(menuHead(mt("speed", "Geschwindigkeit")));
            float cur = player.getPlaybackParameters().speed;
            for (final float s : SPEEDS) {
                boolean on = Math.abs(cur - s) < 0.01f;
                View r = menuRow(speedName(s), null, true, on, () -> { player.setPlaybackSpeed(s); chosen(3); });
                menuSub.addView(r);
                if (on) sel = r;
            }
        }
        menuSub.setVisibility(View.VISIBLE);
        if (sel == null && menuSub.getChildCount() > 1) sel = menuSub.getChildAt(1);
        if (sel != null) sel.requestFocus();
    }

    private void loadLogo(final String url) {
        try {
            io.execute(() -> {
                Bitmap b = null;
                try {
                    java.net.HttpURLConnection c = (java.net.HttpURLConnection) new java.net.URL(url).openConnection();
                    c.setConnectTimeout(4000);
                    c.setReadTimeout(6000);
                    c.setInstanceFollowRedirects(true);
                    java.io.InputStream s = c.getInputStream();
                    b = android.graphics.BitmapFactory.decodeStream(s);
                    s.close();
                    c.disconnect();
                    if (b != null && (b.getWidth() > 256 || b.getHeight() > 256)) {
                        float f = 256f / Math.max(b.getWidth(), b.getHeight());
                        b = Bitmap.createScaledBitmap(b, Math.max(1, Math.round(b.getWidth() * f)), Math.max(1, Math.round(b.getHeight() * f)), true);
                    }
                } catch (Throwable ignored) { }
                final Bitmap bm = b;
                handler.post(() -> {
                    if (bm == null || closing) return;
                    if (logoCache.size() > 80) logoCache.clear();
                    logoCache.put(url, bm);
                    if (bLogo != null && url.equals(bLogo.getTag())) {
                        bLogo.setImageBitmap(bm);
                        bLogoNum.setVisibility(View.GONE);
                    }
                });
            });
        } catch (Throwable ignored) { }
    }

    private void showStatus(String text) {
        if (status == null) return;
        status.setText(text);
        status.setVisibility(View.VISIBLE);
    }

    private void reconnect() {
        if (player == null) return;
        Log.i(TAG, "Wächter: hängt im Laden – neu verbinden (" + hangs + ")");
        showStatus(txtReconnect);
        player.stop();
        if (live) player.seekToDefaultPosition();
        player.prepare();
        player.play();
    }

    private void handleError(PlaybackException e) {
        if (player == null || closing) return;
        Log.i(TAG, "Fehler: " + e.getErrorCodeName() + " (Versuch " + retries + ")");
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
        Log.i(TAG, "failOver: " + why + (triedAlt ? " (aufgegeben)" : " (anderes Format)"));
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
        zapAt = System.currentTimeMillis();
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
        // Einstellungsmenü offen: Tasten gehen nur ans Menü (kein Umschalten, keine Bedienleiste)
        if (menuOpen() && k != KeyEvent.KEYCODE_BACK) return super.dispatchKeyEvent(ev);
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
        if (menuOpen()) {
            // erst die Auswahl schließen, dann das Menü
            if (menuSub.getVisibility() == View.VISIBLE) { int k = menuSubKind; menuSub.setVisibility(View.GONE); menuSubKind = -1; focusMain(k); }
            else closeMenu();
            return;
        }
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
        io.shutdownNow();
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
