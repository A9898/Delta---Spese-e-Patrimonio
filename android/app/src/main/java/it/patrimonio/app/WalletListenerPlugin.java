package it.patrimonio.app;

import android.content.Intent;
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
