package it.patrimonio.app;

import android.app.Notification;
import android.content.Context;
import android.content.SharedPreferences;
import android.os.Bundle;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;

/**
 * Legge le notifiche di pagamento (Google Wallet, Revolut): non esiste un'API pubblica per le transazioni.
 * L'utente concede l'accesso da Impostazioni › Notifiche › Accesso alle notifiche
 * (per un APK installato a mano, Android 13+ chiede prima "Consenti impostazioni con restrizioni").
 *
 * - Le notifiche delle app di pagamento vanno all'app se è aperta, altrimenti in coda (lette all'avvio).
 * - Tutte vengono anche scritte in un registro locale (ultime 40) per la schermata di diagnostica.
 * - In modalità diagnostica (a tempo, attivata dall'utente) si registrano le notifiche di qualsiasi app,
 *   per scoprire il nome del pacchetto e il formato di una banca. Restano solo sul telefono.
 * Il parsing (commerciante, importo, deduplica, categoria) avviene in TypeScript: src/services/gpayParser.ts.
 */
public class WalletNotificationService extends NotificationListenerService {

    /** Pacchetti accettati. Devono coincidere con WALLET_PACKAGES in gpayParser.ts. */
    static final Set<String> PACKAGES = new HashSet<>(Arrays.asList(
            "com.google.android.apps.walletnfcrel",
            "com.google.android.apps.nbu.paisa.user",
            "com.revolut.revolut"
    ));

    static final String PREFS = "wallet_listener";
    static final String KEY_QUEUE = "pending";
    static final String KEY_LOG = "log";
    static final String KEY_DIAG_UNTIL = "diag_until";
    private static final int MAX_QUEUE = 200;
    private static final int MAX_LOG = 40;

    static volatile long lastEventAt = 0;

    @Override
    public void onListenerConnected() {
        lastEventAt = System.currentTimeMillis();
    }

    @Override
    public void onNotificationPosted(StatusBarNotification sbn) {
        if (sbn == null) return;
        String pkg = sbn.getPackageName();
        boolean payment = PACKAGES.contains(pkg);
        SharedPreferences sp = getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        boolean diag = System.currentTimeMillis() < sp.getLong(KEY_DIAG_UNTIL, 0);
        if (!payment && !diag) return;

        Notification n = sbn.getNotification();
        if (n == null || (n.flags & Notification.FLAG_GROUP_SUMMARY) != 0) return;
        Bundle extras = n.extras;
        if (extras == null) return;

        try {
            JSONObject item = new JSONObject();
            item.put("packageName", pkg);
            item.put("title", str(extras.getCharSequence(Notification.EXTRA_TITLE_BIG), extras.getCharSequence(Notification.EXTRA_TITLE)));
            item.put("text", str(extras.getCharSequence(Notification.EXTRA_BIG_TEXT), extras.getCharSequence(Notification.EXTRA_TEXT)));
            item.put("subText", str(extras.getCharSequence(Notification.EXTRA_SUB_TEXT), null));
            item.put("postedAt", sbn.getPostTime());
            item.put("key", sbn.getKey());
            lastEventAt = System.currentTimeMillis();

            boolean forwarded = false;
            if (payment) {
                forwarded = WalletListenerPlugin.emit(item);
                if (!forwarded) enqueue(this, item);
            }
            JSONObject logItem = new JSONObject(item.toString());
            logItem.put("payment", payment);
            logItem.put("forwarded", forwarded);
            appendLog(this, logItem);
        } catch (Exception ignored) {
            // Notifica non leggibile: si ignora.
        }
    }

    private static String str(CharSequence a, CharSequence b) {
        CharSequence c = a != null && a.length() > 0 ? a : b;
        return c == null ? "" : c.toString();
    }

    static synchronized void enqueue(Context ctx, JSONObject item) throws Exception {
        push(ctx, KEY_QUEUE, item, MAX_QUEUE);
    }

    static synchronized void appendLog(Context ctx, JSONObject item) throws Exception {
        push(ctx, KEY_LOG, item, MAX_LOG);
    }

    private static void push(Context ctx, String key, JSONObject item, int max) throws Exception {
        SharedPreferences sp = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        JSONArray arr = new JSONArray(sp.getString(key, "[]"));
        arr.put(item);
        while (arr.length() > max) arr.remove(0);
        sp.edit().putString(key, arr.toString()).apply();
    }

    static synchronized JSONArray drain(Context ctx) throws Exception {
        SharedPreferences sp = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        JSONArray arr = new JSONArray(sp.getString(KEY_QUEUE, "[]"));
        sp.edit().putString(KEY_QUEUE, "[]").apply();
        return arr;
    }

    static synchronized JSONArray readLog(Context ctx) throws Exception {
        return new JSONArray(ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY_LOG, "[]"));
    }

    static synchronized void clearLog(Context ctx) {
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(KEY_LOG, "[]").apply();
    }

    static void setDiagnosticUntil(Context ctx, long until) {
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putLong(KEY_DIAG_UNTIL, until).apply();
    }

    static long diagnosticUntil(Context ctx) {
        return ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getLong(KEY_DIAG_UNTIL, 0);
    }
}
