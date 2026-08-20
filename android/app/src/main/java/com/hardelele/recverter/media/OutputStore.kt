package com.hardelele.recverter.media

import android.content.ContentValues
import android.content.Context
import android.media.MediaScannerConnection
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import android.provider.OpenableColumns
import java.io.File
import java.io.FileInputStream
import java.io.IOException

/**
 * Готовый файл переносится в общую медиатеку, чтобы его видели плееры и «Поделиться».
 * Прямых путей к /sdcard нет: на Android 10+ это MediaStore, ниже — публичная папка
 * плюс ручное сканирование, потому что RELATIVE_PATH там ещё не существует.
 */
object OutputStore {

    private const val FOLDER = "rec.verter"
    private const val COPY_BUFFER = 1 shl 16

    fun publish(context: Context, source: File, displayName: String, mimeType: String): String =
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                publishToMediaStore(context, source, displayName, mimeType)
            } else {
                publishToPublicDir(context, source, displayName)
            }
        } catch (e: IOException) {
            throw ioErrorToMediaError(e)
        }

    private fun publishToMediaStore(
        context: Context,
        source: File,
        displayName: String,
        mimeType: String,
    ): String {
        val resolver = context.contentResolver
        val collection = MediaStore.Audio.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY)
        val values = ContentValues().apply {
            put(MediaStore.Audio.Media.DISPLAY_NAME, displayName)
            put(MediaStore.Audio.Media.MIME_TYPE, mimeType)
            put(
                MediaStore.Audio.Media.RELATIVE_PATH,
                Environment.DIRECTORY_MUSIC + File.separator + FOLDER,
            )
            put(MediaStore.Audio.Media.IS_PENDING, 1)
        }

        val target = resolver.insert(collection, values)
            ?: throw MediaError(MediaErrorCode.NO_SPACE, "MediaStore refused the insert")
        try {
            resolver.openOutputStream(target, "w").use { out ->
                if (out == null) throw IOException("no output stream for $target")
                FileInputStream(source).use { input -> input.copyTo(out, COPY_BUFFER) }
            }
        } catch (e: Throwable) {
            resolver.delete(target, null, null)
            throw e
        }

        values.clear()
        values.put(MediaStore.Audio.Media.IS_PENDING, 0)
        resolver.update(target, values, null, null)
        return target.toString()
    }

    private fun publishToPublicDir(context: Context, source: File, displayName: String): String {
        val dir = File(
            Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_MUSIC),
            FOLDER,
        )
        if (!dir.exists() && !dir.mkdirs()) {
            throw IOException("cannot create $dir")
        }
        val target = unique(dir, displayName)
        FileInputStream(source).use { input ->
            target.outputStream().use { out -> input.copyTo(out, COPY_BUFFER) }
        }
        MediaScannerConnection.scanFile(context, arrayOf(target.absolutePath), null, null)
        return target.absolutePath
    }

    private fun unique(dir: File, displayName: String): File {
        val dot = displayName.lastIndexOf('.')
        val stem = if (dot > 0) displayName.substring(0, dot) else displayName
        val suffix = if (dot > 0) displayName.substring(dot) else ""
        var candidate = File(dir, displayName)
        var n = 1
        while (candidate.exists()) {
            candidate = File(dir, "$stem ($n)$suffix")
            n++
        }
        return candidate
    }

    /** Имя исходника без расширения — из него собирается имя результата. */
    fun sourceStem(context: Context, source: Uri): String {
        val raw = queryDisplayName(context, source) ?: source.lastPathSegment
        val name = raw?.substringAfterLast('/').orEmpty().substringBeforeLast('.')
        val clean = name.replace(Regex("[^\\p{L}\\p{N} ._-]"), "_").trim().take(80)
        return clean.ifEmpty { "audio-" + System.currentTimeMillis() }
    }

    private fun queryDisplayName(context: Context, source: Uri): String? =
        runCatching {
            context.contentResolver
                .query(source, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)
                ?.use { cursor ->
                    if (cursor.moveToFirst() && !cursor.isNull(0)) cursor.getString(0) else null
                }
        }.getOrNull()
}
