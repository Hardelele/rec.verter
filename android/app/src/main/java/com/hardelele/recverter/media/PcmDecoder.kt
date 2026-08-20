package com.hardelele.recverter.media

import android.content.Context
import android.media.AudioFormat
import android.media.MediaCodec
import android.media.MediaFormat
import android.net.Uri
import java.io.IOException
import java.nio.ByteBuffer
import java.nio.ByteOrder

/**
 * Декодирование аудиодорожки в PCM 16 бит. Файл не пишется: результат уходит в [Sink],
 * чтобы одним и тем же кодом пользовались WAV, MP3 и будущее распознавание речи.
 */
object PcmDecoder {

    private const val DEQUEUE_TIMEOUT_US = 10_000L
    const val ASR_SAMPLE_RATE = 16_000

    interface Sink {
        /** Вызывается один раз, до первого [onPcm]: параметры того PCM, что пойдёт дальше. */
        fun onFormat(sampleRate: Int, channels: Int)

        fun onPcm(data: ByteArray, size: Int)
    }

    fun decode(
        context: Context,
        source: Uri,
        options: ConvertOptions,
        sink: Sink,
        progress: ProgressSink = ProgressSink.NONE,
    ) {
        val extractor = openExtractor(context, source)
        var codec: MediaCodec? = null
        try {
            val trackIndex = firstAudioTrack(extractor)
            val inFormat = extractor.getTrackFormat(trackIndex)
            extractor.selectTrack(trackIndex)
            val mime = inFormat.getString(MediaFormat.KEY_MIME)
                ?: throw MediaError(MediaErrorCode.CORRUPTED_SOURCE, "track has no mime")

            val decoder = try {
                MediaCodec.createDecoderByType(mime)
            } catch (e: IOException) {
                throw MediaError(MediaErrorCode.UNSUPPORTED_CONTAINER, mime, e)
            } catch (e: IllegalArgumentException) {
                throw MediaError(MediaErrorCode.UNSUPPORTED_CONTAINER, mime, e)
            }
            codec = decoder

            try {
                decoder.configure(inFormat, null, null, 0)
            } catch (e: IllegalArgumentException) {
                throw MediaError(MediaErrorCode.CORRUPTED_SOURCE, mime, e)
            }
            decoder.start()

            val durationUs = inFormat.longOr(MediaFormat.KEY_DURATION, 0L)
            val info = MediaCodec.BufferInfo()
            var resampler: Mono16k? = null
            var announced = false
            var inputDone = false
            var outputDone = false
            var pcmEncoding = AudioFormat.ENCODING_PCM_16BIT
            var interleaved = ShortArray(0)
            var mono = ShortArray(0)
            var bytes = ByteArray(0)

            while (!outputDone) {
                progress.throwIfCancelled()

                if (!inputDone) {
                    val index = codec.dequeueInputBuffer(DEQUEUE_TIMEOUT_US)
                    if (index >= 0) {
                        val buffer = codec.getInputBuffer(index)
                        val size = if (buffer == null) -1 else extractor.readSampleData(buffer, 0)
                        if (size < 0) {
                            codec.queueInputBuffer(
                                index, 0, 0, 0, MediaCodec.BUFFER_FLAG_END_OF_STREAM,
                            )
                            inputDone = true
                        } else {
                            codec.queueInputBuffer(index, 0, size, extractor.sampleTime, 0)
                            extractor.advance()
                        }
                    }
                }

                val index = codec.dequeueOutputBuffer(info, DEQUEUE_TIMEOUT_US)
                if (index == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED) {
                    pcmEncoding = codec.outputFormat
                        .intOr(MediaFormat.KEY_PCM_ENCODING, AudioFormat.ENCODING_PCM_16BIT)
                    continue
                }
                if (index < 0) continue

                val isConfig = info.flags and MediaCodec.BUFFER_FLAG_CODEC_CONFIG != 0
                if (info.size > 0 && !isConfig) {
                    if (!announced) {
                        val outFormat = codec.outputFormat
                        val srcRate = outFormat.intOr(MediaFormat.KEY_SAMPLE_RATE, 44_100)
                        val srcChannels = outFormat.intOr(MediaFormat.KEY_CHANNEL_COUNT, 2)
                        pcmEncoding = outFormat
                            .intOr(MediaFormat.KEY_PCM_ENCODING, pcmEncoding)
                        if (options.mono16k) {
                            resampler = Mono16k(srcRate, srcChannels)
                            sink.onFormat(ASR_SAMPLE_RATE, 1)
                        } else {
                            sink.onFormat(srcRate, srcChannels)
                        }
                        announced = true
                    }

                    val buffer = codec.getOutputBuffer(index)
                    if (buffer != null) {
                        buffer.position(info.offset)
                        buffer.limit(info.offset + info.size)
                        val samples = readSamples(buffer, pcmEncoding, interleaved)
                        interleaved = samples.first
                        val count = samples.second

                        val active = resampler
                        if (active == null) {
                            bytes = ensure(bytes, count * 2)
                            toLittleEndian(interleaved, count, bytes)
                            sink.onPcm(bytes, count * 2)
                        } else {
                            mono = ensure(mono, active.monoCapacity(count))
                            val monoCount = active.downmix(interleaved, count, mono)
                            val produced = active.resample(mono, monoCount)
                            if (produced.second > 0) {
                                bytes = ensure(bytes, produced.second * 2)
                                toLittleEndian(produced.first, produced.second, bytes)
                                sink.onPcm(bytes, produced.second * 2)
                            }
                        }
                    }
                    if (durationUs > 0) {
                        progress.onProgress(
                            (info.presentationTimeUs.toFloat() / durationUs).coerceIn(0f, 1f),
                        )
                    }
                }

                codec.releaseOutputBuffer(index, false)
                if (info.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM != 0) outputDone = true
            }

            if (!announced) throw MediaError(MediaErrorCode.CORRUPTED_SOURCE, "decoder produced no pcm")
            progress.onProgress(1f)
        } catch (e: MediaCodec.CodecException) {
            throw MediaError(MediaErrorCode.CORRUPTED_SOURCE, e.diagnosticInfo, e)
        } catch (e: IOException) {
            throw ioErrorToMediaError(e)
        } finally {
            val open = codec
            if (open != null) {
                runCatching { open.stop() }
                runCatching { open.release() }
            }
            extractor.release()
        }
    }

    private fun readSamples(
        buffer: ByteBuffer,
        pcmEncoding: Int,
        reuse: ShortArray,
    ): Pair<ShortArray, Int> {
        buffer.order(ByteOrder.LITTLE_ENDIAN)
        return when (pcmEncoding) {
            AudioFormat.ENCODING_PCM_FLOAT -> {
                val floats = buffer.asFloatBuffer()
                val count = floats.remaining()
                val out = ensure(reuse, count)
                for (i in 0 until count) {
                    val v = floats.get(i).coerceIn(-1f, 1f)
                    out[i] = (v * Short.MAX_VALUE).toInt().toShort()
                }
                out to count
            }

            AudioFormat.ENCODING_PCM_8BIT -> {
                val count = buffer.remaining()
                val out = ensure(reuse, count)
                val base = buffer.position()
                for (i in 0 until count) {
                    // 8-битный PCM беззнаковый, ноль лежит на 128.
                    val v = (buffer.get(base + i).toInt() and 0xFF) - 128
                    out[i] = (v shl 8).toShort()
                }
                out to count
            }

            else -> {
                val shorts = buffer.asShortBuffer()
                val count = shorts.remaining()
                val out = ensure(reuse, count)
                shorts.get(out, 0, count)
                out to count
            }
        }
    }

    private fun ensure(array: ShortArray, size: Int): ShortArray =
        if (array.size >= size) array else ShortArray(size)

    private fun ensure(array: ByteArray, size: Int): ByteArray =
        if (array.size >= size) array else ByteArray(size)

    private fun toLittleEndian(samples: ShortArray, count: Int, out: ByteArray) {
        var j = 0
        for (i in 0 until count) {
            val v = samples[i].toInt()
            out[j++] = (v and 0xFF).toByte()
            out[j++] = ((v shr 8) and 0xFF).toByte()
        }
    }

    /**
     * Сведение в моно и линейный ресемплинг в 16 кГц. Состояние живёт между буферами:
     * хранится дробная позиция и последний сэмпл предыдущего буфера, иначе на каждой
     * границе появлялся бы щелчок.
     */
    private class Mono16k(private val sourceRate: Int, private val channels: Int) {
        private val step = sourceRate.toDouble() / ASR_SAMPLE_RATE
        private var position = 0.0
        private var previous: Short = 0
        private var out = ShortArray(0)

        fun monoCapacity(interleavedCount: Int): Int = interleavedCount / channels + 1

        fun downmix(interleaved: ShortArray, count: Int, target: ShortArray): Int {
            if (channels == 1) {
                System.arraycopy(interleaved, 0, target, 0, count)
                return count
            }
            val frames = count / channels
            for (frame in 0 until frames) {
                var sum = 0
                val base = frame * channels
                for (c in 0 until channels) sum += interleaved[base + c]
                target[frame] = (sum / channels).toShort()
            }
            return frames
        }

        fun resample(mono: ShortArray, count: Int): Pair<ShortArray, Int> {
            if (count == 0) return out to 0
            if (sourceRate == ASR_SAMPLE_RATE) return mono to count

            val estimate = (count / step).toInt() + 2
            if (out.size < estimate) out = ShortArray(estimate)

            var produced = 0
            // previous занимает виртуальный индекс -1, поэтому позиция допустима от -1 до count-1.
            while (position <= count - 1) {
                val i = Math.floor(position).toInt()
                val frac = position - i
                val a = if (i < 0) previous.toInt() else mono[i].toInt()
                val b = if (i + 1 < count) mono[i + 1].toInt() else a
                if (produced == out.size) out = out.copyOf(out.size * 2)
                out[produced++] = (a + (b - a) * frac).toInt().toShort()
                position += step
            }
            previous = mono[count - 1]
            position -= count
            return out to produced
        }
    }
}
