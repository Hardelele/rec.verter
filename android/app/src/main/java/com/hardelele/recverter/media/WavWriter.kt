package com.hardelele.recverter.media

import java.io.Closeable
import java.io.File
import java.io.RandomAccessFile

/**
 * PCM → WAV. Заголовок пишется заглушкой сразу, а размеры проставляются в [finish],
 * когда длина потока наконец известна: иначе пришлось бы держать весь PCM в памяти.
 */
class WavWriter(
    target: File,
    private val sampleRate: Int,
    private val channels: Int,
    private val bitsPerSample: Int = 16,
) : Closeable {

    private val file = RandomAccessFile(target, "rw")
    private var dataBytes = 0L
    private var finished = false

    val bytesWritten: Long
        get() = dataBytes

    /** Кадров записано; из этого считается длительность без обращения к контейнеру. */
    val frames: Long
        get() = dataBytes / (channels * bitsPerSample / 8)

    val durationMs: Long
        get() = if (sampleRate > 0) frames * 1000 / sampleRate else 0

    init {
        file.setLength(0)
        file.write(header(0))
    }

    fun write(data: ByteArray, size: Int) {
        file.write(data, 0, size)
        dataBytes += size
    }

    fun finish() {
        if (finished) return
        finished = true
        file.seek(0)
        file.write(header(dataBytes))
        file.channel.force(false)
    }

    override fun close() {
        finish()
        file.close()
    }

    private fun header(dataSize: Long): ByteArray {
        val bytesPerFrame = channels * bitsPerSample / 8
        val out = ByteArray(HEADER_BYTES)
        ascii(out, 0, "RIFF")
        le32(out, 4, dataSize + HEADER_BYTES - 8)
        ascii(out, 8, "WAVE")
        ascii(out, 12, "fmt ")
        le32(out, 16, 16)
        le16(out, 20, 1) // PCM без сжатия
        le16(out, 22, channels)
        le32(out, 24, sampleRate.toLong())
        le32(out, 28, sampleRate.toLong() * bytesPerFrame)
        le16(out, 32, bytesPerFrame)
        le16(out, 34, bitsPerSample)
        ascii(out, 36, "data")
        le32(out, 40, dataSize)
        return out
    }

    companion object {
        const val HEADER_BYTES = 44

        private fun ascii(out: ByteArray, at: Int, text: String) {
            for (i in text.indices) out[at + i] = text[i].code.toByte()
        }

        private fun le16(out: ByteArray, at: Int, value: Int) {
            out[at] = (value and 0xFF).toByte()
            out[at + 1] = ((value shr 8) and 0xFF).toByte()
        }

        private fun le32(out: ByteArray, at: Int, value: Long) {
            out[at] = (value and 0xFF).toByte()
            out[at + 1] = ((value shr 8) and 0xFF).toByte()
            out[at + 2] = ((value shr 16) and 0xFF).toByte()
            out[at + 3] = ((value shr 24) and 0xFF).toByte()
        }
    }
}
