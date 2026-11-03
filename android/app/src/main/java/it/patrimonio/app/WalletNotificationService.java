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
 * Legge le notifiche di pagamento di Google Wallet (non esiste un'API pubblica per le transazioni).
 * L'utente concede l'accesso da Impostazioni › Notifiche › Accesso alle notifiche.
 * Le notifiche vengono inoltrate all'app se è aperta, altrimenti messe in coda e lette all'avvio.
 * Il parsing (commerciante, importo, deduplica, categoria) avviene in TypeScript: src/services/gpayParser.ts.
 */
public class WalletNotificationService extends NotificationListenerService {

    /** Pacchetti accettati: Google Wallet e Google Pay. Aggiungi qui l'app della tua banca se serve. */
    static final Set<String> PACKAGES = new HashSet<>(Arrays.asList(
            "com.google.android.apps.walletnfcrel",
            "com.google.android.apps.nbu.paisa.user"
    ));

    static final String PREFS = "wallet_listener";
    static final String KEY_QUEUE = "pending";
    private static final int MAX_QUEUE = 200;

    @Override
    public void onNotificationPosted(StatusBarNotification sbn) {
        if (sbn == null || !PACKAGES.contains(sbn.getPackageName())) return;
        Notification n = sbn.getNotification();
        if (n == null || (n.flags & Notification.FLAG_GROUP_SUMMARY) != 0) return;
        Bundle extras = n.extras;
        if (extras == null) return;

        CharSequence title = extras.getCharSequence(Notification.EXTRA_TITLE);
        CharSequence text = extras.getCharSequence(Notification.EXTRA_BIG_TEXT);
        if (text == null) text = extras.getCharSequence(Notification.EXTRA_TEXT);

        try {
            JSONObject item = new JSONObject();
            item.put("packageName", sbn.getPackageName());
            item.put("title", title == null ? "" : title.toString());
            item.put("text", text == null ? "" : text.toString());
            item.put("postedAt", sbn.getPostTime());

            if (!WalletListenerPlugin.emit(item)) enqueue(this, item);
        } catch (Exception ignored) {
            // Notifica non leggibile: si ignora.
        }
    }

    static synchronized void enqueue(Context ctx, JSONObject item) throws Exception {
        SharedPreferences sp = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        JSONArray arr = new JSONArray(sp.getString(KEY_QUEUE, "[]"));
        arr.put(item);
        while (arr.length() > MAX_QUEUE) arr.remove(0);
        sp.edit().putString(KEY_QUEUE, arr.toString()).apply();
    }

    static synchronized JSONArray drain(Context ctx) throws Exception {
        SharedPreferences sp = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        JSONArray arr = new JSONArray(sp.getString(KEY_QUEUE, "[]"));
        sp.edit().putString(KEY_QUEUE, "[]").apply();
        return arr;
    }
}
