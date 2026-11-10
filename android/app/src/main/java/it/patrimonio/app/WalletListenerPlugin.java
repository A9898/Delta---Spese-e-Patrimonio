package it.patrimonio.app;

import android.content.ComponentName;
import android.content.Intent;
import android.net.Uri;
import android.service.notification.NotificationListenerService;
import android.provider.Settings;

import androidx.core.app.NotificationManagerCompat;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONArray;
import org.json.JSONObject;

/** Ponte JS ↔ WalletNotificationService. Lato TypeScript: src/services/walletListener.ts */
@CapacitorPlugin(name = "WalletListener")
public class WalletListenerPlugin extends Plugin {

    private static WalletListenerPlugin instance;

    @Override
    public void load() {
        instance = this;
    }

    @Override
    protected void handleOnDestroy() {
        if (instance == this) instance = null;
    }

    /** Inoltra una notifica all'app se è in esecuzione con un listener attivo. */
    static boolean emit(JSONObject item) {
        WalletListenerPlugin p = instance;
        if (p == null || !p.hasListeners("payment")) return false;
        try {
            p.notifyListeners("payment", JSObject.fromJSONObject(item), true);
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    @PluginMethod
    public void isEnabled(PluginCall call) {
        boolean on = NotificationManagerCompat.getEnabledListenerPackages(getContext()).contains(getContext().getPackageName());
        JSObject ret = new JSObject();
        ret.put("enabled", on);
        call.resolve(ret);
    }

    @PluginMethod
    public void openSettings(PluginCall call) {
        Intent i = new Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS);
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(i);
        call.resolve();
    }

    /** Info dell'app: da qui (menu ⋮) si sblocca "Consenti impostazioni con restrizioni" su Android 13+. */
    @PluginMethod
    public void openAppSettings(PluginCall call) {
        Intent i = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.fromParts("package", getContext().getPackageName(), null));
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(i);
        call.resolve();
    }

    /** Chiede al sistema di ricollegare il servizio (utile se Android l'ha fermato). */
    @PluginMethod
    public void rebind(PluginCall call) {
        try {
            NotificationListenerService.requestRebind(new ComponentName(getContext(), WalletNotificationService.class));
        } catch (Exception ignored) { }
        call.resolve();
    }

    @PluginMethod
    public void getLog(PluginCall call) {
        try {
            JSONArray arr = WalletNotificationService.readLog(getContext());
            JSArray items = new JSArray();
            for (int k = 0; k < arr.length(); k++) items.put(JSObject.fromJSONObject(arr.getJSONObject(k)));
            JSObject ret = new JSObject();
            ret.put("items", items);
            ret.put("diagnosticUntil", WalletNotificationService.diagnosticUntil(getContext()));
            ret.put("lastEventAt", WalletNotificationService.lastEventAt);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Registro non leggibile", e);
        }
    }

    @PluginMethod
    public void clearLog(PluginCall call) {
        WalletNotificationService.clearLog(getContext());
        call.resolve();
    }

    /** Registra le notifiche di tutte le app per N minuti (0 = spegni). */
    @PluginMethod
    public void setDiagnostic(PluginCall call) {
        int minutes = call.getInt("minutes", 0);
        long until = minutes > 0 ? System.currentTimeMillis() + minutes * 60_000L : 0;
        WalletNotificationService.setDiagnosticUntil(getContext(), until);
        JSObject ret = new JSObject();
        ret.put("diagnosticUntil", until);
        call.resolve(ret);
    }

    @PluginMethod
    public void drainPending(PluginCall call) {
        try {
            JSONArray arr = WalletNotificationService.drain(getContext());
            JSArray items = new JSArray();
            for (int k = 0; k < arr.length(); k++) items.put(JSObject.fromJSONObject(arr.getJSONObject(k)));
            JSObject ret = new JSObject();
            ret.put("items", items);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Coda non leggibile", e);
        }
    }
}
