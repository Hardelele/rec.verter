package com.hardelele.recverter.media

import android.content.Context
import android.net.Uri
import java.io.File
import java.io.IOException

/**
 * Единственное место, где формат превращается в конвейер. Мост про форматы не знает,
 * добавление нового формата правит только этот when.
 */
object Converter {

    fun convert(
        context: Context,
        source: Uri,
        format: String,
        options: ConvertOptions,
        progress: ProgressSink = ProgressSink.NONE,
    ): ConversionResult {
        val normalized = format.lowercase()
        val mimeType = when (normalized) {
            "m4a" -> "audio/mp4"
            "wav" -> "audio/wav"
            "mp3" -> "audio/mpeg"
            else -> throw MediaError(MediaErrorCode.UNSUPPORTED_FORMAT, normalized)
        }

        val temp = File(context.cacheDir, "recverter-${System.nanoTime()}.$normalized")
        try {
            val durationMs = when (normalized) {
                "m4a" -> AudioExtractor.extractToM4a(context, source, temp, progress).durationMs
                "mp3" -> decodeToMp3(context, source, temp, options, progress)
                else -> decodeToWav(context, source, temp, options, progress)
            }
            progress.throwIfCancelled()

            val sizeBytes = temp.length()
            val name = OutputStore.sourceStem(context, source) + "." + normalized
            val path = OutputStore.publish(context, temp, name, mimeType)
            return ConversionResult(path, mimeType, durationMs, sizeBytes)
        } finally {
            temp.delete()
        }
    }

    private fun decodeToWav(
        context: Context,
        source: Uri,
        target: File,
        options: ConvertOptions,
        progress: ProgressSink,
    ): Long {
        var writer: WavWriter? = null
        try {
            PcmDecoder.decode(
                context,
                source,
                options,
                object : PcmDecoder.Sink {
                    override fun onFormat(sampleRate: Int, channels: Int) {
                        writer = WavWriter(target, sampleRate, channels)
                    }

                    override fun onPcm(data: ByteArray, size: Int) {
                        writer?.write(data, size)
                    }
                },
                progress,
            )
            val written = writer ?: throw MediaError(MediaErrorCode.CORRUPTED_SOURCE, "no pcm")
            written.finish()
            return written.durationMs
        } catch (e: IOException) {
            throw ioErrorToMediaError(e)
        } finally {
            runCatching { writer?.close() }
        }
    }

    /**
     * Тот же конвейер, что и у WAV: [PcmDecoder] ничего не знает про приёмник, поэтому
     * MP3 отличается только классом писателя. Прогресс и отмену считает декодер.
     */
    private fun decodeToMp3(
        context: Context,
        source: Uri,
        target: File,
        options: ConvertOptions,
        progress: ProgressSink,
    ): Long {
        var encoder: Mp3Encoder? = null
        try {
            PcmDecoder.decode(
                context,
                source,
                options,
                object : PcmDecoder.Sink {
                    override fun onFormat(sampleRate: Int, channels: Int) {
                        encoder = Mp3Encoder(target, sampleRate, channels, options.bitrateKbps)
                    }

                    override fun onPcm(data: ByteArray, size: Int) {
                        encoder?.write(data, size)
                    }
                },
                progress,
            )
            val written = encoder ?: throw MediaError(MediaErrorCode.CORRUPTED_SOURCE, "no pcm")
            written.finish()
            return written.durationMs
        } catch (e: IOException) {
            throw ioErrorToMediaError(e)
        } finally {
            runCatching { encoder?.close() }
        }
    }
}
