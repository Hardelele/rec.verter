package com.hardelele.recverter.bridge

import android.content.Intent
import android.net.Uri
import android.os.Build

/**
 * Входящие файлы из «Поделиться» и «Открыть с помощью». Интент приходит раньше, чем
 * JS успевает подписаться, поэтому первый удерживается здесь до запроса из моста.
 */
object ShareIntake {

    private var pending: List<String> = emptyList()
    private var listener: ((List<String>) -> Unit)? = null

    @Synchronized
    fun deliver(intent: Intent?) {
        val uris = urisOf(intent)
        if (uris.isEmpty()) return
        val active = listener
        if (active == null) pending = uris else active(uris)
    }

    @Synchronized
    fun setListener(value: ((List<String>) -> Unit)?) {
        listener = value
    }

    @Synchronized
    fun take(): List<String> {
        val taken = pending
        pending = emptyList()
        return taken
    }

    fun urisOf(intent: Intent?): List<String> {
        if (intent == null) return emptyList()
        return when (intent.action) {
            Intent.ACTION_SEND -> listOfNotNull(stream(intent)).map(Uri::toString)
            Intent.ACTION_SEND_MULTIPLE -> streams(intent).map(Uri::toString)
            Intent.ACTION_VIEW -> listOfNotNull(intent.data).map(Uri::toString)
            else -> emptyList()
        }
    }

    @Suppress("DEPRECATION")
    private fun stream(intent: Intent): Uri? =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            intent.getParcelableExtra(Intent.EXTRA_STREAM, Uri::class.java)
        } else {
            intent.getParcelableExtra(Intent.EXTRA_STREAM) as? Uri
        }

    @Suppress("DEPRECATION")
    private fun streams(intent: Intent): List<Uri> =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM, Uri::class.java).orEmpty()
        } else {
            intent.getParcelableArrayListExtra<Uri>(Intent.EXTRA_STREAM).orEmpty()
        }
}
