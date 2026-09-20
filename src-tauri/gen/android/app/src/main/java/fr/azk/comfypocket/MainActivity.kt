package fr.azk.comfypocket

import android.graphics.Color
import android.os.Build
import android.os.Bundle
import android.view.View
import android.view.WindowManager
import androidx.activity.enableEdgeToEdge
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat

class MainActivity : TauriActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
    val background = Color.rgb(250, 248, 252)
    window.decorView.setBackgroundColor(background)
    WindowCompat.getInsetsController(window, window.decorView).apply {
      isAppearanceLightStatusBars = true
      isAppearanceLightNavigationBars = true
    }
    // Android 11+ supplies IME insets without resizing the window. On Android 10,
    // adjustResize is needed to discover the keyboard and already shrinks the root.
    window.setSoftInputMode(if (Build.VERSION.SDK_INT >= 30)
      WindowManager.LayoutParams.SOFT_INPUT_ADJUST_NOTHING
    else WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE)
    val content = findViewById<View>(android.R.id.content)
    content.setBackgroundColor(background)
    ViewCompat.setOnApplyWindowInsetsListener(content) { view, insets ->
      val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout())
      val keyboard = insets.getInsets(WindowInsetsCompat.Type.ime())
      val bottom = if (Build.VERSION.SDK_INT >= 30) maxOf(bars.bottom, keyboard.bottom)
        else if (insets.isVisible(WindowInsetsCompat.Type.ime())) 0 else bars.bottom
      view.setPadding(bars.left, bars.top, bars.right, bottom)
      // The WebView is entirely inside the safe rectangle; do not inset it twice.
      WindowInsetsCompat.CONSUMED
    }
    ViewCompat.requestApplyInsets(content)
  }
}
