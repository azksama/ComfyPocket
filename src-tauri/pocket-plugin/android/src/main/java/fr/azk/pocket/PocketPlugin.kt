package fr.azk.pocket

import com.google.mlkit.nl.translate.Translation
import com.google.mlkit.nl.translate.TranslatorOptions
import com.google.mlkit.nl.translate.TranslateLanguage
import com.google.mlkit.common.model.DownloadConditions
import java.util.concurrent.atomic.AtomicBoolean
import android.os.Handler
import android.os.Looper
import android.app.Activity
import android.app.KeyguardManager
import android.content.Context
import android.os.SystemClock
import android.os.Build
import android.view.WindowManager
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricPrompt
import androidx.core.content.ContextCompat
import androidx.fragment.app.FragmentActivity
import androidx.lifecycle.DefaultLifecycleObserver
import androidx.lifecycle.LifecycleOwner
import android.content.ContentValues
import android.os.Environment
import android.provider.MediaStore
import android.Manifest
import android.content.pm.PackageManager
import app.tauri.annotation.Permission
import app.tauri.annotation.PermissionCallback
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

@InvokeArg
class LockOptionsArgs { var delaySeconds: Long = 0; var hideRecents: Boolean = true }

@InvokeArg
class TranslationArgs { lateinit var text: String; lateinit var source: String; lateinit var target: String; var cellular: Boolean = false }
@InvokeArg
class LanguageArgs { lateinit var language: String }

@InvokeArg
class ServiceArgs { lateinit var action: String; var language: String = "fr"; var cellular: Boolean = false }

@TauriPlugin(permissions = [Permission(strings = [Manifest.permission.RECORD_AUDIO], alias = "microphone")])
class PocketPlugin(private val activity: Activity): Plugin(activity) {
 private val updates = AppUpdates(activity)
 private val voice = VoiceRecorder()
 private var pendingMicrophone: Invoke? = null
 private val worker = Executors.newSingleThreadExecutor()
 private val preferences = activity.getSharedPreferences("pocket-lock", Context.MODE_PRIVATE)
 @Volatile private var unlocked = false
 private var authenticating = false
 private var lockRevision = 0L
 @Volatile private var backgroundAt: Long = -1
 private val delaySeconds get() = preferences.getLong("delaySeconds", 0)
 private fun expire() { if (enabled && backgroundAt >= 0 && SystemClock.elapsedRealtime() - backgroundAt >= delaySeconds * 1000) unlocked = false }
 private val enabled get() = preferences.getBoolean("enabled", false)
 private val authenticators get() = (if (Build.VERSION.SDK_INT >= 30) BiometricManager.Authenticators.BIOMETRIC_STRONG else BiometricManager.Authenticators.BIOMETRIC_WEAK) or BiometricManager.Authenticators.DEVICE_CREDENTIAL
 private fun available() = (activity.getSystemService(Context.KEYGUARD_SERVICE) as KeyguardManager).isDeviceSecure && BiometricManager.from(activity).canAuthenticate(authenticators) == BiometricManager.BIOMETRIC_SUCCESS
 private fun status(): JSObject { expire(); return JSObject().put("supported", true).put("available", available()).put("enabled", enabled).put("unlocked", !enabled || unlocked).put("delaySeconds", delaySeconds).put("hideRecents", preferences.getBoolean("hideRecents", true)) }
 private fun protectRecents() {
  activity.window.clearFlags(WindowManager.LayoutParams.FLAG_SECURE)
  if (Build.VERSION.SDK_INT >= 33) activity.setRecentsScreenshotEnabled(!enabled || !preferences.getBoolean("hideRecents", true))
 }
 init {
  (activity as? LifecycleOwner)?.lifecycle?.addObserver(object : DefaultLifecycleObserver {
   override fun onPause(owner: LifecycleOwner) { this@PocketPlugin.onPause() }
   override fun onResume(owner: LifecycleOwner) { this@PocketPlugin.onResume() }
   override fun onDestroy(owner: LifecycleOwner) { worker.shutdown(); updates.close(); voice.close() }
  })
 }
 override fun onResume() { expire(); backgroundAt = -1; protectRecents() }
 override fun onPause() { voice.background(); if (enabled && backgroundAt < 0) { backgroundAt = SystemClock.elapsedRealtime(); expire() } }

 @Command fun updateAction(invoke: Invoke) { activity.runOnUiThread {
  expire(); if(enabled&&!unlocked){invoke.reject("Application locked");return@runOnUiThread}
  try { val args=invoke.parseArgs(ServiceArgs::class.java)
   when(args.action){"check"->updates.check();"download"->updates.download();"cancel"->updates.cancel();"install"->{updates.install{result->if(result!=null&&result!="permission")invoke.reject(result)else invoke.resolve(updates.status().put("permissionRequired",result=="permission"))};return@runOnUiThread};"status"->{};else->error("Invalid action")}
   invoke.resolve(updates.status())
  } catch(e:Exception){invoke.reject(e.message?:"Update failed")}
 } }
 @Command fun voiceAction(invoke: Invoke) { activity.runOnUiThread {
  expire();if(enabled&&!unlocked){invoke.reject("Application locked");return@runOnUiThread}
  try {val args=invoke.parseArgs(ServiceArgs::class.java)
   when(args.action){"start"->{
    if(ContextCompat.checkSelfPermission(activity,Manifest.permission.RECORD_AUDIO)!=PackageManager.PERMISSION_GRANTED){
     check(pendingMicrophone==null){"Microphone permission already pending"}
     pendingMicrophone=invoke;requestPermissionForAlias("microphone",invoke,"microphonePermission");return@runOnUiThread
    }
    voice.start()
   };"stop"->voice.stop();"cancel"->{pendingMicrophone?.reject("Dictée annulée");pendingMicrophone=null;voice.cancel()};"take"->{invoke.resolve(voice.take());return@runOnUiThread};"status"->{};else->error("Invalid action")}
   invoke.resolve(voice.status())
  }catch(e:Exception){invoke.reject(e.message?:"Voice failed")}
 } }
 @PermissionCallback private fun microphonePermission(invoke:Invoke) {
  if(pendingMicrophone!==invoke)return
  pendingMicrophone=null
  expire();if(enabled&&!unlocked){invoke.reject("Application locked");return}
  if(ContextCompat.checkSelfPermission(activity,Manifest.permission.RECORD_AUDIO)==PackageManager.PERMISSION_GRANTED)voiceAction(invoke)else invoke.reject("Microphone permission denied")
 }
 @Command fun setAppLanguage(invoke: Invoke) {
  val language = invoke.parseArgs(LanguageArgs::class.java).language
  if (language !in listOf("fr", "en")) { invoke.reject("Invalid language"); return }
  preferences.edit().putString("language", language).apply()
  invoke.resolve(JSObject())
 }
 @Command fun translateText(invoke: Invoke) { activity.runOnUiThread {
  expire()
  if (enabled && !unlocked) { invoke.reject("Application locked"); return@runOnUiThread }
  val args = invoke.parseArgs(TranslationArgs::class.java)
  if (args.text.isBlank() || args.text.length > 10000 || args.source !in TranslateLanguage.getAllLanguages() || args.target !in TranslateLanguage.getAllLanguages()) { invoke.reject("Invalid translation request"); return@runOnUiThread }
  val translator = Translation.getClient(TranslatorOptions.Builder().setSourceLanguage(args.source).setTargetLanguage(args.target).build())
  val completed = AtomicBoolean(false)
  val handler = Handler(Looper.getMainLooper())
  lateinit var timeout: Runnable
  fun finish(text: String?, error: String?) {
   if (!completed.compareAndSet(false, true)) return
   handler.removeCallbacks(timeout)
   translator.close()
   expire()
   if (enabled && !unlocked) invoke.reject("Application locked")
   else if (error != null) invoke.reject(error)
   else invoke.resolve(JSObject().put("text", text))
  }
  timeout = Runnable { finish(null, "Translation timed out. Check your connection and try again.") }
  handler.postDelayed(timeout, 300000)
  val conditions = DownloadConditions.Builder().apply { if (!args.cellular) requireWifi() }.build()
  translator.downloadModelIfNeeded(conditions).addOnSuccessListener {
   if (!completed.get()) translator.translate(args.text).addOnSuccessListener { finish(it, null) }.addOnFailureListener { finish(null, it.message ?: "Translation failed") }
  }.addOnFailureListener { finish(null, it.message ?: "Model download failed") }
 } }
 @Command fun lockStatus(invoke: Invoke) { activity.runOnUiThread { protectRecents(); invoke.resolve(status()) } }
 @Command fun assertUnlocked(invoke: Invoke) { activity.runOnUiThread { expire(); if (enabled && !unlocked) invoke.reject("Application verrouillée") else invoke.resolve(JSObject()) } }
 @Command fun lockSession(invoke: Invoke) { activity.runOnUiThread { lockRevision++; if (enabled) unlocked = false; invoke.resolve(status()) } }
 private fun authenticate(invoke: Invoke, change: Boolean?) {
  activity.runOnUiThread {
   if (authenticating) { invoke.reject("Authentification déjà en cours"); return@runOnUiThread }
   if (!available()) { invoke.reject("Configurez la biométrie ou un code de verrouillage dans les réglages Android."); return@runOnUiThread }
   val host = activity as? FragmentActivity ?: run { invoke.reject("Authentification indisponible"); return@runOnUiThread }
   authenticating = true
   val revision = lockRevision
   val prompt = BiometricPrompt(host, ContextCompat.getMainExecutor(activity), object : BiometricPrompt.AuthenticationCallback() {
    override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
     authenticating = false
     if (revision != lockRevision) { invoke.reject("Application verrouillée. Relancez l’authentification."); return }
     if (change != null && !preferences.edit().putBoolean("enabled", change).commit()) { unlocked = false; invoke.reject("Le réglage ne peut pas être enregistré"); return }
     unlocked = true; backgroundAt = -1; protectRecents(); invoke.resolve(status())
    }
    override fun onAuthenticationError(code: Int, message: CharSequence) { authenticating = false; invoke.reject(message.toString()) }
   })
   try {
    prompt.authenticate(BiometricPrompt.PromptInfo.Builder().setTitle(if (preferences.getString("language", "fr") == "en") { if (change == false) "Disable app lock" else "Unlock Mochi" } else if (change == false) "Désactiver le verrouillage" else "Déverrouiller Mochi").setSubtitle(if (preferences.getString("language", "fr") == "en") "Biometrics or device passcode" else "Biométrie ou code de votre téléphone").setAllowedAuthenticators(authenticators).build())
   } catch (e: Exception) { authenticating = false; invoke.reject(e.message ?: "Authentification indisponible") }
  }
 }
 @Command fun setLockOptions(invoke: Invoke) { activity.runOnUiThread {
  expire()
  if (enabled && !unlocked) { invoke.reject("Application verrouillée"); return@runOnUiThread }
  val args = invoke.parseArgs(LockOptionsArgs::class.java)
  if (args.delaySeconds !in listOf(0L, 30L, 60L, 300L, 900L)) { invoke.reject("Délai invalide"); return@runOnUiThread }
  if (!preferences.edit().putLong("delaySeconds", args.delaySeconds).putBoolean("hideRecents", args.hideRecents).commit()) { invoke.reject("Enregistrement impossible"); return@runOnUiThread }
  protectRecents(); invoke.resolve(status())
 } }
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
     put(MediaStore.Images.Media.RELATIVE_PATH, Environment.DIRECTORY_PICTURES + "/Mochi")
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
