package com.hardelele.recverter.media

import android.content.Context
import android.media.MediaExtractor
import android.media.MediaFormat
import android.net.Uri
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

internal fun openExtractor(context: Context, source: Uri): MediaExtractor {
    val extractor = MediaExtractor()
    try {
        extractor.setDataSource(context, source, null)
    } catch (e: IOException) {
        extractor.release()
        throw MediaError(MediaErrorCode.CORRUPTED_SOURCE, "cannot open source", e)
    } catch (e: IllegalArgumentException) {
        extractor.release()
        throw MediaError(MediaErrorCode.UNSUPPORTED_CONTAINER, "unknown container", e)
    }
    return extractor
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
