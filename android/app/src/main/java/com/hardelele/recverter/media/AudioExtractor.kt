package com.hardelele.recverter.media

import android.content.Context
import android.media.MediaCodec
import android.media.MediaExtractor
import android.media.MediaFormat
import android.media.MediaMuxer
import android.net.Uri
import java.io.File
import java.io.IOException
import java.nio.ByteBuffer

/**
 * Demux: аудиодорожка переносится из исходного контейнера в m4a байт в байт.
 * Ни одного вызова MediaCodec — поэтому час видео обрабатывается за секунды.
 */
object AudioExtractor {

    private const val FALLBACK_BUFFER_BYTES = 1 shl 20

    data class Track(val durationMs: Long, val mimeType: String)

    fun extractToM4a(
        context: Context,
        source: Uri,
        target: File,
        progress: ProgressSink = ProgressSink.NONE,
    ): Track {
        val extractor = openExtractor(context, source)
        var muxer: MediaMuxer? = null
        var muxerStarted = false
        try {
            val trackIndex = firstAudioTrack(extractor)
            val format = extractor.getTrackFormat(trackIndex)
            extractor.selectTrack(trackIndex)

            val out = try {
                MediaMuxer(target.absolutePath, MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4)
            } catch (e: IOException) {
                throw ioErrorToMediaError(e)
            }
            muxer = out

            val outTrack = try {
                out.addTrack(format)
            } catch (e: IllegalArgumentException) {
                // MPEG-4 не умеет заворачивать Vorbis/Opus/FLAC — исходник придётся декодировать.
                throw MediaError(
                    MediaErrorCode.UNSUPPORTED_CONTAINER,
                    format.getString(MediaFormat.KEY_MIME),
                    e,
                )
            }
            out.start()
            muxerStarted = true

            val durationUs = format.longOr(MediaFormat.KEY_DURATION, 0L)
            val capacity = format.intOr(MediaFormat.KEY_MAX_INPUT_SIZE, FALLBACK_BUFFER_BYTES)
                .coerceAtLeast(FALLBACK_BUFFER_BYTES)
            val buffer = ByteBuffer.allocate(capacity)
            val info = MediaCodec.BufferInfo()
            var lastPtsUs = 0L

            while (true) {
                progress.throwIfCancelled()
                val size = extractor.readSampleData(buffer, 0)
                if (size < 0) break

                val ptsUs = extractor.sampleTime
                info.offset = 0
                info.size = size
                info.presentationTimeUs = if (ptsUs < 0) lastPtsUs else ptsUs
                info.flags = bufferFlags(extractor.sampleFlags)
                out.writeSampleData(outTrack, buffer, info)

                lastPtsUs = info.presentationTimeUs
                if (durationUs > 0) {
                    progress.onProgress((lastPtsUs.toFloat() / durationUs).coerceIn(0f, 1f))
                }
                extractor.advance()
            }

            progress.onProgress(1f)
            val durationMs = if (durationUs > 0) durationUs / 1000 else lastPtsUs / 1000
            return Track(durationMs, "audio/mp4")
        } catch (e: IOException) {
            throw ioErrorToMediaError(e)
        } finally {
            val open = muxer
            if (open != null) {
                // stop() на незапущенном или пустом муксере сам бросает IllegalStateException.
                if (muxerStarted) runCatching { open.stop() }
                runCatching { open.release() }
            }
            extractor.release()
        }
    }

    private fun bufferFlags(sampleFlags: Int): Int {
        var flags = 0
        if (sampleFlags and MediaExtractor.SAMPLE_FLAG_SYNC != 0) {
            flags = flags or MediaCodec.BUFFER_FLAG_KEY_FRAME
        }
        if (sampleFlags and MediaExtractor.SAMPLE_FLAG_PARTIAL_FRAME != 0) {
            flags = flags or MediaCodec.BUFFER_FLAG_PARTIAL_FRAME
        }
        return flags
    }
}
