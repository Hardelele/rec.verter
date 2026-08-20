package com.hardelele.recverter.bridge

import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Intent
import android.net.Uri
import com.facebook.react.bridge.ActivityEventListener
import com.facebook.react.bridge.ReactApplicationContext
import java.util.concurrent.atomic.AtomicReference

/**
 * Системный выбор исходного файла. Здесь только запуск интента и возврат URI:
 * метаданные читает `media/SourceInfo`, а что делать с файлом — решает экран.
 *
 * Взят `ACTION_OPEN_DOCUMENT`, а не Photo Picker (`ACTION_PICK_IMAGES`, Android 13+):
 * пикер медиатеки отдаёт только изображения и видео из MediaStore, то есть отрезает
 * произвольные аудиофайлы и всё, что лежит в загрузках или на SD, — а приложение
 * достаёт звук в том числе из присланных в мессенджере записей. Плюс выданный им
 * доступ не persistable, и переживать перезапуск нечем. Разрешений `ACTION_OPEN_DOCUMENT`
 * не требует: доступ выдаёт сам пользователь, выбрав файл.
 */
class SourcePicker(
    private val context: ReactApplicationContext,
) : ActivityEventListener {

    /** `null` — человек закрыл выбор, ничего не выбрав. Это не ошибка. */
    private val pending = AtomicReference<((Uri?) -> Unit)?>(null)

    /**
     * @return false — запустить выбор не удалось: приложение в фоне (активности нет)
     * или в системе нет приложения, умеющего `ACTION_OPEN_DOCUMENT`. Колбэк в этом
     * случае не вызывается вовсе.
     */
    fun pick(onResult: (Uri?) -> Unit): Boolean {
        // Повторный вызов, пока открыт прошлый выбор, — не ошибка: прежнее ожидание
        // закрывается отменой, результат получит последний вызвавший.
        pending.getAndSet(onResult)?.invoke(null)
        return try {
            context.startActivityForResult(intent(), REQUEST_CODE, null).also { started ->
                if (!started) pending.compareAndSet(onResult, null)
            }
        } catch (e: ActivityNotFoundException) {
            pending.compareAndSet(onResult, null)
            false
        }
    }

    /** Мост уходит — ожидающий вызов закрывается отменой, а не повисает. */
    fun release() {
        pending.getAndSet(null)?.invoke(null)
    }

    override fun onActivityResult(
        activity: Activity,
        requestCode: Int,
        resultCode: Int,
        data: Intent?,
    ) {
        if (requestCode != REQUEST_CODE) return
        val onResult = pending.getAndSet(null) ?: return
        val uri = if (resultCode == Activity.RESULT_OK) data?.data else null
        if (uri != null) persist(uri)
        onResult(uri)
    }

    override fun onNewIntent(intent: Intent) = Unit

    private fun intent(): Intent = Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
        addCategory(Intent.CATEGORY_OPENABLE)
        // Тип и EXTRA_MIME_TYPES вместе: одиночный type фильтр не сужает до двух
        // семейств, а без него часть провайдеров показывает вообще всё подряд.
        type = "*/*"
        putExtra(Intent.EXTRA_MIME_TYPES, arrayOf("video/*", "audio/*"))
        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION)
    }

    /**
     * Без этого доступ к чужому URI живёт до конца процесса: приложение свернули,
     * система его убила — и на возврате конвертация падает SecurityException.
     * Провайдер вправе persistable-доступ не выдать (тогда SecurityException прямо
     * здесь), поэтому промах не фатален: метаданные всё равно читаются сразу,
     * пока действует разовый грант.
     */
    private fun persist(uri: Uri) {
        runCatching {
            context.contentResolver.takePersistableUriPermission(
                uri,
                Intent.FLAG_GRANT_READ_URI_PERMISSION,
            )
        }
    }

    private companion object {
        /** Старшие биты запрещены Activity.startActivityForResult. */
        const val REQUEST_CODE = 0x5EC7
    }
}
