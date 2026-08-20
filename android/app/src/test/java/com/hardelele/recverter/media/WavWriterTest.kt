package com.hardelele.recverter.media

import java.io.File
import java.nio.ByteBuffer
import java.nio.ByteOrder
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Before
import org.junit.Test

class WavWriterTest {

    private lateinit var target: File

    @Before
    fun setUp() {
        target = File.createTempFile("wav-writer", ".wav")
    }

    @After
    fun tearDown() {
        target.delete()
    }

    @Test
    fun `header describes the pcm that was written`() {
        val pcm = byteArrayOf(0, 0, 1, 0, 2, 0, 3, 0)
        WavWriter(target, sampleRate = 8000, channels = 1).use { writer ->
            writer.write(pcm, pcm.size)
            writer.finish()
            assertEquals(4L, writer.frames)
            assertEquals(0L, writer.durationMs)
        }

        val bytes = target.readBytes()
        assertEquals((WavWriter.HEADER_BYTES + pcm.size).toLong(), bytes.size.toLong())

        val header = ByteBuffer.wrap(bytes).order(ByteOrder.LITTLE_ENDIAN)
        assertEquals("RIFF", ascii(bytes, 0))
        assertEquals(36 + pcm.size, header.getInt(4))
        assertEquals("WAVE", ascii(bytes, 8))
        assertEquals("fmt ", ascii(bytes, 12))
        assertEquals(16, header.getInt(16))
        assertEquals(1, header.getShort(20).toInt()) // PCM
        assertEquals(1, header.getShort(22).toInt()) // каналы
        assertEquals(8000, header.getInt(24))
        assertEquals(16000, header.getInt(28)) // 8000 * 1 * 2
        assertEquals(2, header.getShort(32).toInt())
        assertEquals(16, header.getShort(34).toInt())
        assertEquals("data", ascii(bytes, 36))
        assertEquals(pcm.size, header.getInt(40))

        val payload = bytes.copyOfRange(WavWriter.HEADER_BYTES, bytes.size)
        assertEquals(pcm.toList(), payload.toList())
    }

    @Test
    fun `stereo 44100 header carries the right rates and duration`() {
        val frames = 44_100
        val pcm = ByteArray(frames * 2 * 2)
        WavWriter(target, sampleRate = 44_100, channels = 2).use { writer ->
            writer.write(pcm, pcm.size)
            writer.finish()
            assertEquals(frames.toLong(), writer.frames)
            assertEquals(1000L, writer.durationMs)
        }

        val bytes = target.readBytes()
        val header = ByteBuffer.wrap(bytes).order(ByteOrder.LITTLE_ENDIAN)
        assertEquals(2, header.getShort(22).toInt())
        assertEquals(44_100, header.getInt(24))
        assertEquals(44_100 * 4, header.getInt(28))
        assertEquals(4, header.getShort(32).toInt())
        assertEquals(pcm.size, header.getInt(40))
        assertEquals(36 + pcm.size, header.getInt(4))
    }

    private fun ascii(bytes: ByteArray, at: Int): String =
        String(bytes, at, 4, Charsets.US_ASCII)
}
