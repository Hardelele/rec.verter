package com.hardelele.recverter.media

import com.hardelele.recverter.lame.Lame
import java.io.Closeable
import java.io.File
import java.io.RandomAccessFile

/**
 * PCM → MP3 через LAME. Форма та же, что у [WavWriter]: писатель принимает куски
 * PCM от [PcmDecoder] и сам знает, сколько времени звука через него прошло.
 *
 * Битрейт постоянный. Переменный дал бы файл меньше при том же качестве, но у CBR
 * длительность считается из размера даже плеером, который не читает заголовок Xing,
 * а конвертер люди открывают чем попало.
 */
class Mp3Encoder(
    target: File,
    private val sampleRate: Int,
    private val channels: Int,
    bitrateKbps: Int,
) : Closeable {

    private val file = RandomAccessFile(target, "rw")
    private val handle: Long
    private var out = ByteArray(0)
    private var frames = 0L
    private var finished = false

    val durationMs: Long
        get() = if (sampleRate > 0) frames * 1000 / sampleRate else 0

    init {
        if (!Lame.available) throw MediaError(MediaErrorCode.UNSUPPORTED_FORMAT, "lame missing")
        file.setLength(0)
        handle = Lame.nativeInit(sampleRate, channels, nearestBitrate(bitrateKbps), QUALITY)
        if (handle == 0L) {
            file.close()
            throw MediaError(MediaErrorCode.UNSUPPORTED_FORMAT, "lame rejected $sampleRate/$channels")
        }
    }

    fun write(data: ByteArray, size: Int) {
        if (size <= 0) return
        val chunkFrames = size / 2 / channels
        val buffer = ensure(Lame.outputCapacity(chunkFrames))
        val written = Lame.nativeEncode(handle, data, size, buffer, buffer.size)
        if (written < 0) throw MediaError(MediaErrorCode.CORRUPTED_SOURCE, "lame encode $written")
        if (written > 0) file.write(buffer, 0, written)
        frames += chunkFrames
    }

    fun finish() {
        if (finished) return
        finished = true

        val buffer = ensure(Lame.outputCapacity(0))
        val tail = Lame.nativeFlush(handle, buffer, buffer.size)
        if (tail > 0) file.write(buffer, 0, tail)

        // Первый кадр потока — заглушка, зарезервированная lame_init_params. Настоящий
        // заголовок Xing/LAME известен только сейчас, когда поток дописан, поэтому
        // кладётся поверх заглушки; длина совпадает, файл не сдвигается.
        val tag = Lame.nativeLametagFrame(handle, buffer, buffer.size)
        if (tag > 0) {
            file.seek(0)
            file.write(buffer, 0, tag)
        }
        file.channel.force(false)
    }

    override fun close() {
        runCatching { finish() }
        Lame.nativeClose(handle)
        file.close()
    }

    private fun ensure(size: Int): ByteArray {
        if (out.size < size) out = ByteArray(size)
        return out
    }

    companion object {
        /** 0 — медленно и хорошо, 9 — быстро и плохо; 2 у LAME считается рабочей точкой. */
        private const val QUALITY = 2

        val BITRATES = intArrayOf(128, 192, 320)

        /**
         * Битрейт приходит из JS, где его может задать кто угодно. Вместо отказа берём
         * ближайший поддерживаемый: пользователю нужен файл, а не код ошибки про 137 kbps.
         */
        fun nearestBitrate(requested: Int): Int =
            BITRATES.minByOrNull { kotlin.math.abs(it - requested) } ?: 192
    }
}
