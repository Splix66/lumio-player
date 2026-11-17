package de.lumio.player;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.res.ColorStateList;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.RectF;
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
import android.widget.ScrollView;
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
    private TextView liveTag;        // LIVE-Schild statt Zeitleiste (nur Live, nur bei offener Bedienleiste)
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

        // Live: statt Puffer-Zeitleiste („00:40 · 01:00“ – wirkte wie eine Sendung von einer Minute) ein LIVE-Schild.
        // Den Fortschritt der laufenden Sendung zeigt das Banner, das bei offener Bedienleiste darüber steht.
        if (live) {
            for (String n : new String[] { "exo_progress", "exo_time", "exo_position", "exo_duration" }) {
                View x = exo(n);
                if (x != null) x.setVisibility(View.INVISIBLE);
            }
            liveTag = text(13, Color.WHITE, true);
            liveTag.setText("LIVE");
            liveTag.setLetterSpacing(0.08f);
            liveTag.setPadding(dp(10), dp(4), dp(10), dp(4));
            // Neues Aussehen (1.15.10): dunkles Glas-Schild mit rotem Punkt – wie das Schild LIVE in der Vorschau der App
            GradientDrawable lt = new GradientDrawable();
            lt.setColor(0x8C0C0A16);
            lt.setCornerRadius(dp(100));
            lt.setStroke(dp(1), 0x40FFFFFF);
            liveTag.setBackground(lt);
            GradientDrawable ld = new GradientDrawable();
            ld.setShape(GradientDrawable.OVAL);
            ld.setColor(0xFFFF5B73);
            ld.setSize(dp(8), dp(8));
            liveTag.setCompoundDrawablesRelativeWithIntrinsicBounds(ld, null, null, null);
            liveTag.setCompoundDrawablePadding(dp(7));
            liveTag.setVisibility(View.GONE);
            FrameLayout.LayoutParams lpl = new FrameLayout.LayoutParams(-2, -2, Gravity.BOTTOM | Gravity.START);
            lpl.setMargins(dp(40), 0, 0, dp(30));
            root.addView(liveTag, lpl);
        }
        buildMenu(root);
        // Bedienung im Stil A (1.15.12): eigene Ebene statt der Media3-Leiste (die bleibt unsichtbar und steuert nur das Ein-/Ausblenden)
        try {
            JSONArray ri = menuTexts != null ? menuTexts.optJSONArray("recentIdx") : null;
            if (ri != null) for (int k = 0; k < ri.length(); k++) { int v = ri.optInt(k, -1); if (v >= 0 && v < urls.size() && !recentIdx.contains(v)) recentIdx.add(v); }
            // Herz: welche Einträge in der App schon gemerkt sind (nicht bei Folgen)
            favOk = menuTexts != null && menuTexts.optBoolean("favOk", false);
            JSONArray fi = menuTexts != null ? menuTexts.optJSONArray("favIdx") : null;
            if (fi != null) for (int k = 0; k < fi.length(); k++) { int v = fi.optInt(k, -1); if (v >= 0 && v < urls.size()) favs.add(v); }
            favs0.addAll(favs);
        } catch (Exception ignored) { }
        buildOsdA(root);
        buildList(root);
        // Bildformat wie zuletzt gewählt (Original, Zoom, Strecken)
        view.setResizeMode(getSharedPreferences("telvo_player", MODE_PRIVATE).getInt("resize", AspectRatioFrameLayout.RESIZE_MODE_FIT));

        status = makeLabel(20);
        status.setVisibility(View.GONE);
        root.addView(status, new FrameLayout.LayoutParams(FrameLayout.LayoutParams.WRAP_CONTENT, FrameLayout.LayoutParams.WRAP_CONTENT, Gravity.CENTER));

        setContentView(root);
        hideSystemUi();

        view.setControllerVisibilityListener((PlayerView.ControllerVisibilityListener) visibility -> {
            osd = visibility == View.VISIBLE;
            // Stil A (1.15.12): Die Media3-Leiste ist unsichtbar; mit ihr erscheint und verschwindet die eigene Bedienung.
            // Das kleine Sender-Banner (beim Umschalten) wird dann nicht gebraucht.
            if (liveTag != null) liveTag.setVisibility(View.GONE);
            if (visibility == View.VISIBLE) {
                handler.removeCallbacks(hideInfo);
                info.setVisibility(View.GONE);
                showOsdA();
            } else {
                // Gerade erst umgeschaltet (kurze Anzeige ohne Knöpfe): die läuft selbst ab
                if (osdA != null && !peek) osdA.setVisibility(View.GONE);
                if (peek && aRow != null) aRow.setVisibility(View.INVISIBLE);
                handler.removeCallbacks(osdTick);
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
            public void onIsPlayingChanged(boolean isPlaying) {
                // Pause: Bedienung bleibt stehen (Stil A); läuft es wieder, blendet sie sich nach 4 s aus
                if (view == null) return;
                boolean paused = !isPlaying && !player.getPlayWhenReady();
                view.setControllerShowTimeoutMs(paused ? 0 : 4000);
                if (paused && !menuOpen() && !listOpen()) view.showController();
                paintPause();
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
                // „Zuletzt gesehen“: der neue Sender steht vorn (für die Liste im Player)
                if (live && player != null) {
                    Integer ci = player.getCurrentMediaItemIndex();
                    recentIdx.remove(ci); recentIdx.add(0, ci);
                    visited.remove(ci); visited.add(ci);
                }
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
        bg.setColor(0xD9221E34);          // lila getöntes Glas (neues Aussehen 1.15.10), vorher neutrales Schwarz
        bg.setCornerRadius(dp(14));
        bg.setStroke(dp(1), 0x47C4A7FF);
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
        on.setStroke(dp(3), 0xFFC084FC);  // gewählt: weiß mit lila Ring – dieselbe Markierung wie in der App (1.15.10)
        GradientDrawable off = new GradientDrawable();
        off.setShape(GradientDrawable.OVAL);
        off.setColor(big ? 0x40FFFFFF : 0x24FFFFFF);
        off.setStroke(dp(1), 0x3DFFFFFF);
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
                    new int[] { 0xB30E0C18, 0x1A0E0C18, 0x000E0C18, 0x590E0C18, 0xF20E0C18 }));   // dunkles Lila der App statt Schwarz
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
            // Stil A (1.15.12): Die Media3-Leiste bleibt unsichtbar und nicht anwählbar – sie liefert nur Ein-/Ausblenden
            // und die Wartezeit. Bedient wird über die eigene Ebene (buildOsdA).
            View ctl = exo("exo_controller");
            if (ctl != null) { ctl.setAlpha(0f); noFocus(ctl); }
            for (String n : new String[] { "exo_prev", "exo_rew_with_amount", "exo_ffwd_with_amount", "exo_next",
                    "exo_subtitle", "exo_settings", "exo_overflow_show", "exo_overflow_hide", "exo_fullscreen" }) {
                styleButton(exo(n), false);
            }
        } catch (Exception e) {
            // Optik ist Nebensache – der Player muss in jedem Fall laufen
        }
    }

    /* ==========================================================
       Bedienung im Stil A (1.15.12) – wie der Player in der App (Erays Entwürfe „Player A4“ / „Stil A für alle Player“):
       oben links LIVE, oben rechts die Uhr; unten Sender bzw. FILM, großer Titel, Zeit, Zeitleiste und wenige Knöpfe
       (Pause, Senderliste, Zuletzt gesehen, Herz, Rad). Rechts unten nur Text „ALS NÄCHSTES“. Das Herz meldet beim
       Schließen an die App zurück, was gemerkt bzw. entfernt wurde (favAdd/favDel). Das alte kleine Sender-Banner wird
       nicht mehr gezeigt: Beim Öffnen und Umschalten erscheint kurz dieselbe Ebene ohne Knöpfe („peek“).
       ========================================================== */
    private FrameLayout osdA, listLayer, aLogoBox;
    private ImageView aLogo;
    private android.widget.LinearLayout aFavBtn;
    private Ico aFavIco;
    private boolean favOk = false, peek = false;
    private final java.util.HashSet<Integer> favs = new java.util.HashSet<>(), favs0 = new java.util.HashSet<>();
    // „this.“ – osd ist weiter unten deklariert (sonst unzulässiger Vorwärtsbezug im Feld-Initialisierer)
    private final Runnable hidePeek = () -> {
        if (this.peek && !this.osd && this.osdA != null) this.osdA.setVisibility(View.GONE);
        this.peek = false;
    };
    private TextView aLive, aClock, aKick, aTitle, aMeta, aStart, aEnd, aNextLbl, aNextVal;
    private View aFill, aRest;
    private android.widget.LinearLayout aRecentBtn;
    private android.widget.LinearLayout aBarRow, aRow, aRight, aPause, listPanel;
    private Ico aPauseIco;
    private TextView aPauseTxt;
    private ScrollView listScroll;
    private final ArrayList<Integer> recentIdx = new ArrayList<>();
    // In diesem Player geschaute Sender (älteste zuerst) – gehen beim Schließen an „Zuletzt gesehen“ der App
    private final ArrayList<Integer> visited = new ArrayList<>();
    private View listFocus, subSel;
    private final Runnable focusPanelRun = this::focusPanel;
    private final Runnable osdTick = new Runnable() {
        @Override
        public void run() {
            if (!osd || osdA == null) return;
            if (aClock != null) aClock.setText(hhmm(System.currentTimeMillis() / 1000L));
            if (!live) paintBar();
            handler.postDelayed(this, 1000);
        }
    };

    /* Einfache Symbole, selbst gezeichnet (keine Bilddateien nötig) */
    static class Ico extends View {
        static final int PLAY = 0, PAUSE = 1, LIST = 2, RECENT = 3, GEAR = 4, HEART = 5, HEART_FILL = 6;
        static final int RED = 0xFFFF3B30;   // gemerkt – dasselbe Rot wie in der App
        int kind;
        final Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
        final Path path = new Path();
        final RectF r = new RectF();
        Ico(Context c, int kind) { super(c); this.kind = kind; p.setColor(Color.WHITE); }
        void setKind(int k) { if (kind != k) { kind = k; invalidate(); } }
        void setColor(int c) { p.setColor(c); invalidate(); }
        @Override
        protected void onDraw(Canvas cv) {
            float w = getWidth(), h = getHeight(), s = Math.min(w, h), x = (w - s) / 2f, y = (h - s) / 2f, cx = w / 2f, cy = h / 2f;
            p.setStrokeCap(Paint.Cap.ROUND);
            p.setStrokeJoin(Paint.Join.ROUND);
            path.reset();
            if (kind == PLAY) {
                p.setStyle(Paint.Style.FILL);
                path.moveTo(x + s * .24f, y + s * .12f); path.lineTo(x + s * .88f, y + s * .5f); path.lineTo(x + s * .24f, y + s * .88f); path.close();
                cv.drawPath(path, p);
            } else if (kind == PAUSE) {
                p.setStyle(Paint.Style.FILL);
                r.set(x + s * .18f, y + s * .12f, x + s * .4f, y + s * .88f); cv.drawRoundRect(r, s * .06f, s * .06f, p);
                r.set(x + s * .6f, y + s * .12f, x + s * .82f, y + s * .88f); cv.drawRoundRect(r, s * .06f, s * .06f, p);
            } else if (kind == LIST) {
                p.setStyle(Paint.Style.STROKE); p.setStrokeWidth(s * .11f);
                for (int i = 0; i < 3; i++) { float ly = y + s * (.22f + i * .28f); cv.drawLine(x + s * .36f, ly, x + s * .9f, ly, p); cv.drawPoint(x + s * .12f, ly, p); }
            } else if (kind == RECENT) {
                p.setStyle(Paint.Style.STROKE); p.setStrokeWidth(s * .1f);
                r.set(x + s * .12f, y + s * .12f, x + s * .88f, y + s * .88f);
                cv.drawArc(r, 215, 290, false, p);
                cv.drawLine(cx, y + s * .3f, cx, cy, p);
                cv.drawLine(cx, cy, x + s * .66f, y + s * .62f, p);
                p.setStyle(Paint.Style.FILL);
                path.moveTo(x + s * .02f, y + s * .2f); path.lineTo(x + s * .32f, y + s * .26f); path.lineTo(x + s * .1f, y + s * .48f); path.close();
                cv.drawPath(path, p);
            } else if (kind == HEART || kind == HEART_FILL) {
                // Herz: leer (nur Umriss) = nicht gemerkt, rot gefüllt = gemerkt
                path.moveTo(x + s * .5f, y + s * .86f);
                path.cubicTo(x + s * .14f, y + s * .62f, x + s * .04f, y + s * .44f, x + s * .1f, y + s * .28f);
                path.cubicTo(x + s * .18f, y + s * .1f, x + s * .42f, y + s * .1f, x + s * .5f, y + s * .3f);
                path.cubicTo(x + s * .58f, y + s * .1f, x + s * .82f, y + s * .1f, x + s * .9f, y + s * .28f);
                path.cubicTo(x + s * .96f, y + s * .44f, x + s * .86f, y + s * .62f, x + s * .5f, y + s * .86f);
                path.close();
                if (kind == HEART_FILL) {
                    int c = p.getColor();
                    p.setStyle(Paint.Style.FILL);
                    p.setColor(RED);
                    cv.drawPath(path, p);
                    p.setColor(c);
                } else {
                    p.setStyle(Paint.Style.STROKE); p.setStrokeWidth(s * .1f);
                    cv.drawPath(path, p);
                }
            } else {
                // Rad: Ring mit acht Zähnen
                p.setStyle(Paint.Style.FILL);
                for (int i = 0; i < 8; i++) {
                    cv.save(); cv.rotate(i * 45f, cx, cy);
                    r.set(cx - s * .09f, y + s * .04f, cx + s * .09f, y + s * .24f); cv.drawRoundRect(r, s * .03f, s * .03f, p);
                    cv.restore();
                }
                p.setStyle(Paint.Style.STROKE); p.setStrokeWidth(s * .14f);
                cv.drawCircle(cx, cy, s * .27f, p);
            }
        }
    }

    private static void noFocus(View v) {
        v.setFocusable(false);
        v.setFocusableInTouchMode(false);
        if (v instanceof ViewGroup) {
            ViewGroup g = (ViewGroup) v;
            g.setDescendantFocusability(ViewGroup.FOCUS_BLOCK_DESCENDANTS);
            for (int i = 0; i < g.getChildCount(); i++) noFocus(g.getChildAt(i));
        }
    }

    /* Knopf im Stil A: Glas, gewählt weiß mit lila Ring; mit Schrift (Pause, Senderliste …) oder rund nur mit Symbol */
    private android.widget.LinearLayout pillA(int ico, String label, boolean round, final Runnable onClick) {
        final android.widget.LinearLayout b = new android.widget.LinearLayout(this);
        b.setOrientation(android.widget.LinearLayout.HORIZONTAL);
        b.setGravity(Gravity.CENTER);
        b.setFocusable(true);
        b.setClickable(true);
        b.setContentDescription(label);
        StateListDrawable st = new StateListDrawable();
        GradientDrawable on = new GradientDrawable();
        on.setColor(Color.WHITE);
        on.setCornerRadius(dp(100));
        on.setStroke(dp(3), 0xFFC084FC);
        GradientDrawable off = new GradientDrawable();
        off.setColor(0x24FFFFFF);
        off.setCornerRadius(dp(100));
        off.setStroke(dp(1), 0x38FFFFFF);
        st.addState(new int[] { android.R.attr.state_focused }, on);
        st.addState(new int[] { android.R.attr.state_pressed }, on);
        st.addState(new int[] {}, off);
        b.setBackground(st);
        final Ico ic = new Ico(this, ico);
        b.addView(ic, new android.widget.LinearLayout.LayoutParams(dp(15), dp(15)));
        final TextView t = round ? null : text(13, Color.WHITE, true);
        if (t != null) {
            t.setText(label);
            android.widget.LinearLayout.LayoutParams lt = new android.widget.LinearLayout.LayoutParams(-2, -2);
            lt.setMarginStart(dp(8));
            b.addView(t, lt);
            b.setPadding(dp(14), 0, dp(18), 0);
        }
        b.setOnFocusChangeListener((v, f) -> {
            int c = f ? 0xFF120F1A : Color.WHITE;
            ic.setColor(c);
            if (t != null) t.setTextColor(c);
        });
        b.setOnClickListener(v -> { onClick.run(); });
        if (ico == Ico.PAUSE || ico == Ico.PLAY) { aPauseIco = ic; aPauseTxt = t; }
        if (ico == Ico.HEART || ico == Ico.HEART_FILL) aFavIco = ic;
        return b;
    }

    private void buildOsdA(FrameLayout root) {
        int sh = getResources().getDisplayMetrics().heightPixels;
        osdA = new FrameLayout(this);
        osdA.setVisibility(View.GONE);
        View top = new View(this);
        top.setBackground(new GradientDrawable(GradientDrawable.Orientation.TOP_BOTTOM, new int[] { 0xB3080710, 0x00080710 }));
        osdA.addView(top, new FrameLayout.LayoutParams(-1, dp(110), Gravity.TOP));
        View bot = new View(this);
        bot.setBackground(new GradientDrawable(GradientDrawable.Orientation.BOTTOM_TOP, new int[] { 0xF2080710, 0xC7080710, 0x00080710 }));
        osdA.addView(bot, new FrameLayout.LayoutParams(-1, sh * 62 / 100, Gravity.BOTTOM));

        if (live) {
            aLive = text(12, Color.WHITE, true);
            aLive.setText("LIVE");
            aLive.setLetterSpacing(0.08f);
            aLive.setPadding(dp(10), dp(4), dp(11), dp(4));
            GradientDrawable lt = new GradientDrawable();
            lt.setColor(0x990B0B0F);
            lt.setCornerRadius(dp(100));
            lt.setStroke(dp(1), 0x40FFFFFF);
            aLive.setBackground(lt);
            GradientDrawable ld = new GradientDrawable();
            ld.setShape(GradientDrawable.OVAL);
            ld.setColor(0xFFFF5B73);
            ld.setSize(dp(7), dp(7));
            aLive.setCompoundDrawablesRelativeWithIntrinsicBounds(ld, null, null, null);
            aLive.setCompoundDrawablePadding(dp(7));
            FrameLayout.LayoutParams ll = new FrameLayout.LayoutParams(-2, -2, Gravity.TOP | Gravity.START);
            ll.setMargins(dp(48), dp(26), 0, 0);
            osdA.addView(aLive, ll);
        }
        aClock = text(19, Color.WHITE, true);
        FrameLayout.LayoutParams lc = new FrameLayout.LayoutParams(-2, -2, Gravity.TOP | Gravity.END);
        lc.setMargins(0, dp(22), dp(48), 0);
        osdA.addView(aClock, lc);

        android.widget.LinearLayout col = new android.widget.LinearLayout(this);
        col.setOrientation(android.widget.LinearLayout.VERTICAL);
        FrameLayout.LayoutParams lcol = new FrameLayout.LayoutParams(-1, -2, Gravity.BOTTOM);
        lcol.setMargins(dp(48), 0, dp(48), dp(30));
        osdA.addView(col, lcol);

        // Senderlogo vor „Nr · Sender“ (wie im eingebauten Player der App)
        android.widget.LinearLayout kickRow = new android.widget.LinearLayout(this);
        kickRow.setOrientation(android.widget.LinearLayout.HORIZONTAL);
        kickRow.setGravity(Gravity.CENTER_VERTICAL);
        aLogoBox = new FrameLayout(this);
        GradientDrawable lgb = new GradientDrawable();
        lgb.setColor(0x24FFFFFF);
        lgb.setCornerRadius(dp(6));
        lgb.setStroke(dp(1), 0x26FFFFFF);
        aLogoBox.setBackground(lgb);
        aLogoBox.setPadding(dp(4), dp(3), dp(4), dp(3));
        aLogo = new ImageView(this);
        aLogo.setScaleType(ImageView.ScaleType.FIT_CENTER);
        aLogoBox.addView(aLogo, new FrameLayout.LayoutParams(-1, -1));
        aLogoBox.setVisibility(View.GONE);
        android.widget.LinearLayout.LayoutParams llg = new android.widget.LinearLayout.LayoutParams(dp(44), dp(28));
        llg.setMarginEnd(dp(10));
        kickRow.addView(aLogoBox, llg);
        aKick = text(13, Color.WHITE, true);
        kickRow.addView(aKick, new android.widget.LinearLayout.LayoutParams(-2, -2));
        col.addView(kickRow, new android.widget.LinearLayout.LayoutParams(-1, -2));
        aTitle = text(34, Color.WHITE, true);
        aTitle.setSingleLine(false);
        aTitle.setMaxLines(2);
        aTitle.setLetterSpacing(-0.02f);
        android.widget.LinearLayout.LayoutParams lt2 = new android.widget.LinearLayout.LayoutParams(-1, -2);
        lt2.topMargin = dp(6);
        col.addView(aTitle, lt2);
        aMeta = text(13, 0xFFD6D6DE, false);
        android.widget.LinearLayout.LayoutParams lm = new android.widget.LinearLayout.LayoutParams(-1, -2);
        lm.topMargin = dp(6);
        col.addView(aMeta, lm);

        aBarRow = new android.widget.LinearLayout(this);
        aBarRow.setOrientation(android.widget.LinearLayout.HORIZONTAL);
        aBarRow.setGravity(Gravity.CENTER_VERTICAL);
        aStart = text(11, 0xFFC9C9D3, false);
        aEnd = text(11, 0xFFC9C9D3, false);
        android.widget.LinearLayout track = new android.widget.LinearLayout(this);
        track.setOrientation(android.widget.LinearLayout.HORIZONTAL);
        GradientDrawable tr = new GradientDrawable();
        tr.setColor(0x2EFFFFFF);
        tr.setCornerRadius(dp(3));
        track.setBackground(tr);
        aFill = new View(this);
        GradientDrawable fl = new GradientDrawable(GradientDrawable.Orientation.LEFT_RIGHT, new int[] { 0xFFA855F7, 0xFFE9D5FF });
        fl.setCornerRadius(dp(3));
        aFill.setBackground(fl);
        aRest = new View(this);
        track.addView(aFill, new android.widget.LinearLayout.LayoutParams(0, -1, 0f));
        track.addView(aRest, new android.widget.LinearLayout.LayoutParams(0, -1, 1f));
        android.widget.LinearLayout.LayoutParams ls = new android.widget.LinearLayout.LayoutParams(dp(52), -2);
        aBarRow.addView(aStart, ls);
        aBarRow.addView(track, new android.widget.LinearLayout.LayoutParams(0, dp(4), 1f));
        aEnd.setGravity(Gravity.END);
        aBarRow.addView(aEnd, new android.widget.LinearLayout.LayoutParams(dp(60), -2));
        android.widget.LinearLayout.LayoutParams lb = new android.widget.LinearLayout.LayoutParams(-1, -2);
        lb.topMargin = dp(14);
        col.addView(aBarRow, lb);

        android.widget.LinearLayout bottom = new android.widget.LinearLayout(this);
        bottom.setOrientation(android.widget.LinearLayout.HORIZONTAL);
        bottom.setGravity(Gravity.BOTTOM);
        android.widget.LinearLayout.LayoutParams lbo = new android.widget.LinearLayout.LayoutParams(-1, -2);
        lbo.topMargin = dp(16);
        col.addView(bottom, lbo);
        aRow = new android.widget.LinearLayout(this);
        aRow.setOrientation(android.widget.LinearLayout.HORIZONTAL);
        aRow.setGravity(Gravity.CENTER_VERTICAL);
        bottom.addView(aRow, new android.widget.LinearLayout.LayoutParams(-2, -2));
        bottom.addView(new View(this), new android.widget.LinearLayout.LayoutParams(0, 1, 1f));
        aRight = new android.widget.LinearLayout(this);
        aRight.setOrientation(android.widget.LinearLayout.VERTICAL);
        aRight.setGravity(Gravity.END);
        aNextLbl = text(9, 0xFFB9B9C4, true);
        aNextLbl.setLetterSpacing(0.1f);
        aNextVal = text(13, 0xFFE8E8EE, true);
        aNextVal.setMaxWidth(getResources().getDisplayMetrics().widthPixels * 28 / 100);
        aRight.addView(aNextLbl);
        aRight.addView(aNextVal);
        bottom.addView(aRight, new android.widget.LinearLayout.LayoutParams(-2, -2));

        aPause = pillA(Ico.PAUSE, mt("pause", "Pause"), false, () -> {
            if (player == null) return;
            if (player.getPlayWhenReady()) player.pause(); else player.play();
            paintPause();
            view.showController();
        });
        addToRow(aPause);
        if (live && urls.size() > 1) addToRow(pillA(Ico.LIST, mt("channels", "Senderliste"), false, () -> openList(0)));
        if (live) { aRecentBtn = pillA(Ico.RECENT, mt("recent", "Zuletzt gesehen"), false, () -> openList(1)); addToRow(aRecentBtn); }
        if (favOk) { aFavBtn = roundA(Ico.HEART, mt("fav", "Merken"), this::toggleFav); addToRow(aFavBtn); }
        addToRow(roundA(Ico.GEAR, mt("settingsA", "Einstellungen"), () -> openMenu(-1)));
        root.addView(osdA, new FrameLayout.LayoutParams(-1, -1));
    }

    private android.widget.LinearLayout roundA(int ico, String label, Runnable onClick) {
        return pillA(ico, label, true, onClick);
    }

    private void addToRow(android.widget.LinearLayout b) {
        boolean round = b.getChildCount() == 1;
        android.widget.LinearLayout.LayoutParams lp = new android.widget.LinearLayout.LayoutParams(round ? dp(34) : -2, dp(34));
        if (aRow.getChildCount() > 0) lp.setMarginStart(dp(9));
        aRow.addView(b, lp);
    }

    private void showOsdA() {
        if (osdA == null) return;
        handler.removeCallbacks(hidePeek);
        peek = false;
        aRow.setVisibility(View.VISIBLE);
        paintOsdA();
        osdA.setVisibility(View.VISIBLE);
        osdA.bringToFront();
        if (menuLayer != null && menuOpen()) menuLayer.bringToFront();
        View f = getCurrentFocus();
        // Rad oder Liste offen: die Markierung bleibt dort
        if (!menuOpen() && !listOpen() && (f == null || !isInside(f, osdA))) aPause.requestFocus();
        handler.removeCallbacks(osdTick);
        handler.postDelayed(osdTick, 1000);
    }

    /* Beim Öffnen und Umschalten (statt des alten Sender-Banners, Erays Wunsch 17.11.2026): dieselbe Ebene kurz ohne
       Knöpfe. Die Bedienleiste bleibt zu – Hoch/Runter schaltet also weiter um, OK oder ein Pfeil holt die Knöpfe. */
    private void showPeek() {
        if (osdA == null || isFinishing()) return;
        if (osd) { paintOsdA(); return; }
        if (menuOpen() || listOpen()) return;
        aRow.setVisibility(View.INVISIBLE);
        paintOsdA();
        osdA.setVisibility(View.VISIBLE);
        osdA.bringToFront();
        peek = true;
        handler.removeCallbacks(hidePeek);
        handler.postDelayed(hidePeek, 4000);
    }

    /* Herz: merken bzw. entfernen; die App erfährt es beim Schließen (favAdd/favDel) */
    private void toggleFav() {
        if (player == null) return;
        Integer i = player.getCurrentMediaItemIndex();
        if (!favs.remove(i)) favs.add(i);
        paintFav();
        if (view != null) view.showController();   // Ausblende-Zeit neu starten
    }

    private void paintFav() {
        if (aFavIco == null || aFavBtn == null || player == null) return;
        boolean on = favs.contains(player.getCurrentMediaItemIndex());
        aFavIco.setKind(on ? Ico.HEART_FILL : Ico.HEART);
        aFavBtn.setContentDescription(on ? mt("faved", "Gemerkt") : mt("fav", "Merken"));
    }

    private static boolean isInside(View v, View parent) {
        for (Object p = v; p instanceof View; p = ((View) p).getParent()) if (p == parent) return true;
        return false;
    }

    /* Laufende und nächste Sendung eines Senders aus den mitgegebenen Programmdaten */
    private JSONArray[] curNext(int i, long now) {
        JSONArray ep = live && i >= 0 && i < epgs.size() ? epgs.get(i) : null;
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
        return new JSONArray[] { cur, next };
    }

    private void setBarA(float pct) {
        pct = Math.max(0f, Math.min(1f, pct));
        ((android.widget.LinearLayout.LayoutParams) aFill.getLayoutParams()).weight = pct;
        ((android.widget.LinearLayout.LayoutParams) aRest.getLayoutParams()).weight = 1f - pct;
        aFill.requestLayout();
    }

    private static String clockTime(long ms) {
        long t = Math.max(0, ms / 1000L), h = t / 3600, m = (t % 3600) / 60, s = t % 60;
        return h > 0 ? String.format(java.util.Locale.ROOT, "%d:%02d:%02d", h, m, s) : String.format(java.util.Locale.ROOT, "%d:%02d", m, s);
    }

    private void paintOsdA() {
        if (osdA == null || player == null) return;
        int i = player.getCurrentMediaItemIndex();
        if (i < 0 || i >= titles.size()) return;
        long now = System.currentTimeMillis() / 1000L;
        aClock.setText(hhmm(now));
        String name = i < names.size() && names.get(i).length() > 0 ? names.get(i) : titles.get(i);
        if (live) {
            String num = i < nums.size() ? nums.get(i) : "";
            aKick.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13);
            aKick.setLetterSpacing(0f);
            aKick.setTextColor(Color.WHITE);
            aKick.setText(num.length() > 0 ? num + " · " + name : name);
            // Senderlogo: aus dem Zwischenspeicher oder im Hintergrund laden (ohne Logo: kein leerer Kasten)
            String logo = i < logos.size() ? logos.get(i) : "";
            Bitmap lb = logo.length() > 0 ? logoCache.get(logo) : null;
            aLogo.setTag(logo);
            aLogo.setImageBitmap(lb);
            aLogoBox.setVisibility(lb != null ? View.VISIBLE : View.GONE);
            if (lb == null && logo.startsWith("http")) loadLogo(logo);
            JSONArray[] cn = curNext(i, now);
            JSONArray cur = cn[0], next = cn[1];
            if (cur != null) {
                long s = cur.optLong(1), en = cur.optLong(2);
                aKick.setVisibility(View.VISIBLE);
                aTitle.setText(cur.optString(0));
                String left = en > now ? "  ·  " + mt("left", "noch {0} Min.").replace("{0}", String.valueOf(Math.max(1, Math.round((en - now) / 60f)))) : "";
                aMeta.setText(hhmm(s) + " – " + hhmm(en) + left);
                aMeta.setVisibility(View.VISIBLE);
                aStart.setText(hhmm(s));
                aEnd.setText(hhmm(en));
                setBarA(en > s ? (now - s) / (float) (en - s) : 0f);
                aBarRow.setVisibility(View.VISIBLE);
            } else {
                // ohne Programmdaten: nur der Sendername groß
                aKick.setVisibility(View.GONE);
                aTitle.setText(num.length() > 0 ? num + " · " + name : name);
                aMeta.setVisibility(View.GONE);
                aBarRow.setVisibility(View.GONE);
            }
            if (next != null) {
                String lbl = mt("nextUp", "Als Nächstes").toUpperCase(appLocale);
                android.text.SpannableString sp = new android.text.SpannableString(lbl + "  ·  " + hhmm(next.optLong(1)));
                sp.setSpan(new android.text.style.ForegroundColorSpan(0xFFC4B5FD), 0, lbl.length(), android.text.Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
                aNextLbl.setText(sp);
                aNextVal.setText(next.optString(0));
                aRight.setVisibility(View.VISIBLE);
            } else aRight.setVisibility(View.GONE);
            if (aRecentBtn != null) {
                boolean any = false;
                for (Integer r : recentIdx) if (r != i) { any = true; break; }
                aRecentBtn.setVisibility(any ? View.VISIBLE : View.GONE);
            }
        } else {
            aKick.setTextSize(TypedValue.COMPLEX_UNIT_SP, 10);
            aKick.setLetterSpacing(0.1f);
            aKick.setTextColor(0xFFC9C9D3);
            aKick.setText((urls.size() > 1 ? mt("series", "Serie") : mt("film", "Film")).toUpperCase(appLocale));
            aKick.setVisibility(View.VISIBLE);
            aTitle.setText(name);
            aMeta.setVisibility(View.GONE);
            aRight.setVisibility(View.GONE);
            aLogoBox.setVisibility(View.GONE);
            paintBar();
        }
        paintPause();
        paintFav();
    }

    private void paintBar() {
        if (player == null || live || aBarRow == null) return;
        long d = player.getDuration(), pos = player.getCurrentPosition();
        if (d == C.TIME_UNSET || d <= 0) { aBarRow.setVisibility(View.INVISIBLE); return; }
        aBarRow.setVisibility(View.VISIBLE);
        aStart.setText(clockTime(pos));
        aEnd.setText("−" + clockTime(d - pos));
        setBarA(pos / (float) d);
    }

    private void paintPause() {
        if (aPauseIco == null || player == null) return;
        boolean playing = player.getPlayWhenReady();
        aPauseIco.setKind(playing ? Ico.PAUSE : Ico.PLAY);
        if (aPauseTxt != null) aPauseTxt.setText(playing ? mt("pause", "Pause") : mt("play", "Abspielen"));
        if (aPause != null) aPause.setContentDescription(playing ? mt("pause", "Pause") : mt("play", "Abspielen"));
    }

    /* Senderliste (alle mitgegebenen Sender, links) und „Zuletzt gesehen“ (höchstens 5, rechts in der Mitte) */
    private boolean listOpen() { return listLayer != null && listLayer.getVisibility() == View.VISIBLE; }

    private void buildList(FrameLayout root) {
        listLayer = new FrameLayout(this);
        listLayer.setVisibility(View.GONE);
        listScroll = new ScrollView(this);
        listScroll.setVerticalScrollBarEnabled(false);
        listScroll.setClipToPadding(false);
        listPanel = menuPanel();
        listScroll.addView(listPanel, new FrameLayout.LayoutParams(-1, -2));
        listLayer.addView(listScroll, new FrameLayout.LayoutParams(-2, -2));
        root.addView(listLayer, new FrameLayout.LayoutParams(-1, -1));
    }

    private void openList(int kind) {
        if (player == null || listLayer == null) return;
        view.hideController();
        listPanel.removeAllViews();
        int cur = player.getCurrentMediaItemIndex();
        listPanel.addView(menuHead(kind == 0 ? mt("channels", "Senderliste") : mt("recent", "Zuletzt gesehen")));
        List<Integer> idx = new ArrayList<>();
        if (kind == 0) { for (int i = 0; i < urls.size(); i++) idx.add(i); }
        else { idx.add(cur); for (Integer r : recentIdx) if (r != cur && !idx.contains(r) && idx.size() < 5) idx.add(r); }
        long now = System.currentTimeMillis() / 1000L;
        View focus = null;
        for (final Integer i : idx) {
            String nm = i < names.size() && names.get(i).length() > 0 ? names.get(i) : titles.get(i);
            String num = i < nums.size() ? nums.get(i) : "";
            JSONArray c = curNext(i, now)[0];
            String sub = c != null ? c.optString(0) : "";
            if (i == cur) sub = mt("now", "Jetzt") + (sub.length() > 0 ? " · " + sub : "");
            View row = menuRow((num.length() > 0 ? num + " · " : "") + nm, sub, true, null, () -> { closeList(); jumpTo(i); });
            listPanel.addView(row);
            if (i == cur) focus = row;
        }
        int w = getResources().getDisplayMetrics().widthPixels;
        FrameLayout.LayoutParams lp;
        if (kind == 0) { lp = new FrameLayout.LayoutParams(w * 30 / 100, -1, Gravity.START); lp.setMargins(dp(40), dp(28), 0, dp(28)); }
        else { lp = new FrameLayout.LayoutParams(w * 30 / 100, -2, Gravity.END | Gravity.CENTER_VERTICAL); lp.setMargins(0, 0, dp(40), 0); }
        listScroll.setLayoutParams(lp);
        listLayer.setVisibility(View.VISIBLE);
        listLayer.bringToFront();
        final View f = focus != null ? focus : (listPanel.getChildCount() > 1 ? listPanel.getChildAt(1) : null);
        listFocus = f;
        if (f != null) {
            f.requestFocus();
            f.post(() -> listScroll.smoothScrollTo(0, Math.max(0, f.getTop() - dp(120))));
        }
        focusPanelSoon();
    }

    /* Rad bzw. Liste offen: die Markierung sicher hineinsetzen. Beim ersten Öffnen ging sie verloren (Gerätetest
       17.11.2026, Fire TV Stick): Die Bedienleiste blendet sich gerade aus und gab den Fokus an die Bildfläche ab –
       das Fenster war dann offen, aber nicht bedienbar, und Hoch/Runter holte die Bedienleiste zurück. */
    private void focusPanel() {
        View f = getCurrentFocus();
        if (menuOpen()) {
            if (f != null && isInside(f, menuLayer)) return;
            if (menuSub.getVisibility() == View.VISIBLE) {
                View s = subSel != null && subSel.getParent() == menuSub ? subSel : null;
                for (int k = 1; s == null && k < menuSub.getChildCount(); k++) if (menuSub.getChildAt(k).isFocusable()) s = menuSub.getChildAt(k);
                if (s != null) s.requestFocus();
            } else focusMain(-1);
        } else if (listOpen()) {
            if (f != null && isInside(f, listLayer)) return;
            View s = listFocus != null && listFocus.getParent() == listPanel ? listFocus : (listPanel.getChildCount() > 1 ? listPanel.getChildAt(1) : null);
            if (s != null) s.requestFocus();
        }
    }

    /* gleich und noch einmal, wenn die Bedienleiste fertig ausgeblendet ist */
    private void focusPanelSoon() {
        handler.removeCallbacks(focusPanelRun);
        handler.post(focusPanelRun);
        handler.postDelayed(focusPanelRun, 400);
    }

    private void closeList() {
        if (listLayer != null) listLayer.setVisibility(View.GONE);
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
        bg.setColor(0xD9221E34);
        bg.setCornerRadius(dp(18));
        bg.setStroke(dp(1), 0x47C4A7FF);
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

        // Das alte kleine Sender-Banner wird nicht mehr gezeigt (Erays Wunsch 17.11.2026) – statt dessen die Stil-A-Ebene
        info.setVisibility(View.GONE);
        showPeek();
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
                        if (isPlaceholder(t)) continue;
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
                        if (player != null && player.getCurrentMediaItemIndex() == idx && osdA != null && osdA.getVisibility() == View.VISIBLE) paintOsdA();
                    }
                });
            });
        } catch (Throwable ignored) { epgLoading.remove(idx); }
    }

    /* Wie weit das Banner bei offener Bedienleiste nach oben rutscht: über die Leiste unten, aber nie in die runden
       Knöpfe in der Mitte (⏮ ⏸ ⏭) – auf kleinen Bildschirmen (z. B. Boxen mit 960×540) stieß es sonst an sie. */
    private float bannerLift() {
        float ty = -dp(96);
        try {
            View cc = exo("exo_center_controls");
            if (cc != null && cc.getHeight() > 0 && info != null && info.getHeight() > 0) {
                int[] a = new int[2], b = new int[2];
                cc.getLocationOnScreen(a);
                info.getLocationOnScreen(b);
                float top = b[1] - info.getTranslationY();          // Oberkante ohne bisherige Verschiebung
                float min = a[1] + cc.getHeight() + dp(12) - top;    // so weit darf es höchstens hoch
                if (ty < min) ty = Math.min(0f, min);
            }
        } catch (Throwable ignored) { }
        return ty;
    }

    /* Platzhalter statt Sendung („No Data“ u. Ä.) – nicht anzeigen (gleiche Regel in app.js: epgReal) */
    private static final java.util.regex.Pattern PLACEHOLDER = java.util.regex.Pattern.compile(
            "^(no\\s*(data|info(rmation)?|epg|programm?e?|program)|n/a|keine\\s+(daten|informationen|sendungsinformationen)|kein\\s+programm|tba|to be announced)\\.?$",
            java.util.regex.Pattern.CASE_INSENSITIVE);

    private static boolean isPlaceholder(String t) {
        String s = t == null ? "" : t.trim();
        return s.isEmpty() || PLACEHOLDER.matcher(s).matches();
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
        bg.setColor(0xEB221E34);
        bg.setCornerRadius(dp(18));
        bg.setStroke(dp(1), 0x47C4A7FF);
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
        on.setStroke(dp(2), 0xFFC084FC);
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
        focusPanelSoon();
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
        subSel = sel;
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
                    if (aLogo != null && url.equals(aLogo.getTag())) {
                        aLogo.setImageBitmap(bm);
                        aLogoBox.setVisibility(View.VISIBLE);
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
        if ((menuOpen() || listOpen()) && k != KeyEvent.KEYCODE_BACK) {
            // Markierung nicht im Fenster (z. B. auf der Bildfläche): die Taste setzt sie hinein, statt die Bedienleiste zu holen
            View f = getCurrentFocus();
            if (isNavKey(k) && (f == null || !isInside(f, menuOpen() ? menuLayer : listLayer))) {
                if (ev.getAction() == KeyEvent.ACTION_DOWN) focusPanel();
                return true;
            }
            return super.dispatchKeyEvent(ev);
        }
        if (ev.getAction() == KeyEvent.ACTION_UP && k == consumedKey) {
            consumedKey = -1;
            return true;
        }
        if (ev.getAction() == KeyEvent.ACTION_DOWN && view != null && handleKey(k)) {
            consumedKey = k;
            return true;
        }
        // Stil A: Bedienung zu – OK oder ein Pfeil blendet sie ein (die Media3-Leiste hat keine anwählbaren Knöpfe mehr,
        // darum kommt die Taste sonst nirgends an)
        if (ev.getAction() == KeyEvent.ACTION_DOWN && view != null && !osd && isNavKey(k)) {
            view.showController();
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
            if (k == KeyEvent.KEYCODE_DPAD_RIGHT || k == KeyEvent.KEYCODE_MEDIA_FAST_FORWARD) { seekBy(10000); return true; }   // 10 s wie in der App (Stil A)
            if (k == KeyEvent.KEYCODE_DPAD_LEFT || k == KeyEvent.KEYCODE_MEDIA_REWIND) { seekBy(-10000); return true; }
        }
        if (k == KeyEvent.KEYCODE_INFO || k == KeyEvent.KEYCODE_GUIDE) { showInfo(); return true; }
        return false;
    }

    @Override
    public void onBackPressed() {
        if (listOpen()) { closeList(); if (view != null) view.showController(); return; }
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
        if (live && !visited.isEmpty()) {
            int[] v = new int[visited.size()];
            for (int k = 0; k < v.length; k++) v[k] = visited.get(k);
            data.putExtra("visited", v);
        }
        // Herz: was in diesem Player gemerkt bzw. entfernt wurde
        ArrayList<Integer> add = new ArrayList<>(), del = new ArrayList<>();
        for (Integer f : favs) if (!favs0.contains(f)) add.add(f);
        for (Integer f : favs0) if (!favs.contains(f)) del.add(f);
        if (!add.isEmpty()) { int[] a = new int[add.size()]; for (int k = 0; k < a.length; k++) a[k] = add.get(k); data.putExtra("favAdd", a); }
        if (!del.isEmpty()) { int[] a = new int[del.size()]; for (int k = 0; k < a.length; k++) a[k] = del.get(k); data.putExtra("favDel", a); }
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
