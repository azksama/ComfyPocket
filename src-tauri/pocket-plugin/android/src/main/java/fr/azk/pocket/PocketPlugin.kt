package fr.azk.pocket

import android.app.Activity
import android.app.KeyguardManager
import android.content.Context
import android.os.Build
import android.view.WindowManager
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricPrompt
import androidx.core.content.ContextCompat
import androidx.fragment.app.FragmentActivity
import android.content.ContentValues
import android.os.Environment
import android.provider.MediaStore
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import java.io.File
import java.util.concurrent.Executors

@InvokeArg
class SaveArgs { lateinit var path: String; lateinit var filename: String; lateinit var mime: String }
@InvokeArg
class LockArgs { var enabled: Boolean = false }

@TauriPlugin
class PocketPlugin(private val activity: Activity): Plugin(activity) {
 private val worker = Executors.newSingleThreadExecutor()
 private val preferences = activity.getSharedPreferences("pocket-lock", Context.MODE_PRIVATE)
 @Volatile private var unlocked = false
 private var authenticating = false
 private val enabled get() = preferences.getBoolean("enabled", false)
 private val authenticators get() = (if (Build.VERSION.SDK_INT >= 30) BiometricManager.Authenticators.BIOMETRIC_STRONG else BiometricManager.Authenticators.BIOMETRIC_WEAK) or BiometricManager.Authenticators.DEVICE_CREDENTIAL
 private fun available() = (activity.getSystemService(Context.KEYGUARD_SERVICE) as KeyguardManager).isDeviceSecure && BiometricManager.from(activity).canAuthenticate(authenticators) == BiometricManager.BIOMETRIC_SUCCESS
 private fun status() = JSObject().put("supported", true).put("available", available()).put("enabled", enabled).put("unlocked", !enabled || unlocked)
 private fun protectRecents() { if (enabled) activity.window.addFlags(WindowManager.LayoutParams.FLAG_SECURE) else activity.window.clearFlags(WindowManager.LayoutParams.FLAG_SECURE) }
 override fun onResume() { protectRecents() }
 override fun onPause() { if (enabled) unlocked = false }
 @Command fun lockStatus(invoke: Invoke) { activity.runOnUiThread { protectRecents(); invoke.resolve(status()) } }
 @Command fun assertUnlocked(invoke: Invoke) { if (enabled && !unlocked) invoke.reject("Application verrouillée") else invoke.resolve(JSObject()) }
 @Command fun lockSession(invoke: Invoke) { if (enabled) unlocked = false; invoke.resolve(status()) }
 private fun authenticate(invoke: Invoke, change: Boolean?) {
  activity.runOnUiThread {
   if (authenticating) { invoke.reject("Authentification déjà en cours"); return@runOnUiThread }
   if (!available()) { invoke.reject("Configurez la biométrie ou un code de verrouillage dans les réglages Android."); return@runOnUiThread }
   val host = activity as? FragmentActivity ?: run { invoke.reject("Authentification indisponible"); return@runOnUiThread }
   authenticating = true
   val prompt = BiometricPrompt(host, ContextCompat.getMainExecutor(activity), object : BiometricPrompt.AuthenticationCallback() {
    override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
     authenticating = false
     if (change != null && !preferences.edit().putBoolean("enabled", change).commit()) { unlocked = false; invoke.reject("Le réglage ne peut pas être enregistré"); return }
     unlocked = true; protectRecents(); invoke.resolve(status())
    }
    override fun onAuthenticationError(code: Int, message: CharSequence) { authenticating = false; invoke.reject(message.toString()) }
   })
   try {
    prompt.authenticate(BiometricPrompt.PromptInfo.Builder().setTitle(if (change == false) "Désactiver le verrouillage" else "Déverrouiller Comfy Pocket").setSubtitle("Biométrie ou code de votre téléphone").setAllowedAuthenticators(authenticators).build())
   } catch (e: Exception) { authenticating = false; invoke.reject(e.message ?: "Authentification indisponible") }
  }
 }
 @Command fun unlock(invoke: Invoke) { if (!enabled) invoke.resolve(status()) else authenticate(invoke, null) }
 @Command fun setBiometricLock(invoke: Invoke) { authenticate(invoke, invoke.parseArgs(LockArgs::class.java).enabled) }
 @Command
 fun save(invoke: Invoke) {
  val args = invoke.parseArgs(SaveArgs::class.java)
  worker.execute {
   var uri: android.net.Uri? = null
   try {
    val source = File(args.path).canonicalFile
    require(source.parentFile == activity.cacheDir.canonicalFile) { "Fichier source interdit" }
    val values = ContentValues().apply {
     put(MediaStore.Images.Media.DISPLAY_NAME, args.filename)
     put(MediaStore.Images.Media.MIME_TYPE, args.mime)
     put(MediaStore.Images.Media.RELATIVE_PATH, Environment.DIRECTORY_PICTURES + "/ComfyPocket")
     put(MediaStore.Images.Media.IS_PENDING, 1)
    }
    uri = activity.contentResolver.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values)
      ?: throw IllegalStateException("Création du fichier impossible")
    activity.contentResolver.openOutputStream(uri)?.use { out -> source.inputStream().use { it.copyTo(out) } }
      ?: throw IllegalStateException("Écriture impossible")
    values.clear(); values.put(MediaStore.Images.Media.IS_PENDING, 0)
    activity.contentResolver.update(uri, values, null, null)
    invoke.resolve(JSObject().put("saved", true))
   } catch(e: Exception) {
    uri?.let { activity.contentResolver.delete(it, null, null) }
    invoke.reject(e.message ?: "Enregistrement impossible")
   }
  }
 }
}
