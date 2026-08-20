package com.hardelele.recverter.media

import android.content.Context
import android.media.MediaExtractor
import android.media.MediaFormat
import android.net.Uri
import android.os.ParcelFileDescriptor
import java.io.Closeable
import java.io.IOException

enum class MediaErrorCode {
    NO_AUDIO_TRACK,
    UNSUPPORTED_CONTAINER,
    UNSUPPORTED_FORMAT,
    CORRUPTED_SOURCE,
    NO_SPACE,
    CANCELLED,
}

class MediaError(
    val code: MediaErrorCode,
    message: String? = null,
    cause: Throwable? = null,
) : Exception(message ?: code.name, cause)

/** Наблюдатель конвейера: принимает прогресс и в любой момент может его остановить. */
interface ProgressSink {
    fun onProgress(fraction: Float)

    fun isCancelled(): Boolean

    companion object {
        val NONE: ProgressSink =
            object : ProgressSink {
                override fun onProgress(fraction: Float) = Unit

                override fun isCancelled(): Boolean = false
            }
    }
}

data class ConvertOptions(
    val bitrateKbps: Int = 192,
    val mono16k: Boolean = false,
)

data class ConversionResult(
    val path: String,
    val mimeType: String,
    val durationMs: Long,
    val sizeBytes: Long,
)

internal fun ProgressSink.throwIfCancelled() {
    if (isCancelled()) throw MediaError(MediaErrorCode.CANCELLED)
}

/**
 * Открытый исходник. Дескриптор живёт ровно столько же, сколько экстрактор,
 * поэтому они закрываются вместе.
 */
internal class Source(
    val extractor: MediaExtractor,
    private val descriptor: ParcelFileDescriptor?,
) : Closeable {
    override fun close() {
        runCatching { extractor.release() }
        runCatching { descriptor?.close() }
    }
}

/**
 * Источник открывается через дескриптор от ContentResolver, а не по пути: при Scoped
 * Storage нативный FileSource не имеет доступа к чужим файлам даже по абсолютному пути,
 * а доступ по content-URI выдаётся именно дескриптором.
 */
internal fun openSource(context: Context, source: Uri): Source {
    val extractor = MediaExtractor()
    val descriptor = runCatching {
        context.contentResolver.openFileDescriptor(source, "r")
    }.getOrNull()

    try {
        if (descriptor != null) {
            extractor.setDataSource(descriptor.fileDescriptor)
        } else {
            extractor.setDataSource(context, source, null)
        }
    } catch (e: IOException) {
        extractor.release()
        descriptor?.close()
        throw MediaError(MediaErrorCode.CORRUPTED_SOURCE, "cannot open source", e)
    } catch (e: IllegalArgumentException) {
        extractor.release()
        descriptor?.close()
        throw MediaError(MediaErrorCode.UNSUPPORTED_CONTAINER, "unknown container", e)
    } catch (e: SecurityException) {
        extractor.release()
        descriptor?.close()
        throw MediaError(MediaErrorCode.CORRUPTED_SOURCE, "no access to source", e)
    }
    return Source(extractor, descriptor)
}

/** Первая аудиодорожка контейнера; остальные игнорируются намеренно. */
internal fun firstAudioTrack(extractor: MediaExtractor): Int {
    for (i in 0 until extractor.trackCount) {
        val mime = extractor.getTrackFormat(i).getString(MediaFormat.KEY_MIME) ?: continue
        if (mime.startsWith("audio/")) return i
    }
    throw MediaError(MediaErrorCode.NO_AUDIO_TRACK)
}

internal fun MediaFormat.longOr(key: String, fallback: Long): Long =
    if (containsKey(key)) getLong(key) else fallback

internal fun MediaFormat.intOr(key: String, fallback: Int): Int =
    if (containsKey(key)) getInteger(key) else fallback

/** ENOSPC приходит с разных уровней стека, поэтому опознаём его по тексту. */
internal fun ioErrorToMediaError(e: IOException): MediaError {
    val text = (e.message ?: "") + (e.cause?.message ?: "")
    return if (text.contains("ENOSPC") || text.contains("No space", ignoreCase = true)) {
        MediaError(MediaErrorCode.NO_SPACE, e.message, e)
    } else {
        MediaError(MediaErrorCode.CORRUPTED_SOURCE, e.message, e)
    }
}
