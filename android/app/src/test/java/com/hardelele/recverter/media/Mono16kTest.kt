package com.hardelele.recverter.media

import kotlin.math.abs
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class Mono16kTest {

    @Test
    fun `stereo frames are averaged into mono`() {
        val converter = Mono16k(sourceRate = 16_000, channels = 2)
        val interleaved = shortArrayOf(100, 300, -400, -200, 0, 0)
        val mono = ShortArray(converter.monoCapacity(interleaved.size))

        val frames = converter.downmix(interleaved, interleaved.size, mono)

        assertEquals(3, frames)
        assertEquals(200, mono[0].toInt())
        assertEquals(-300, mono[1].toInt())
        assertEquals(0, mono[2].toInt())
    }

    @Test
    fun `16 kHz mono passes through untouched`() {
        val converter = Mono16k(sourceRate = 16_000, channels = 1)
        val mono = shortArrayOf(1, 2, 3, 4)

        val (out, count) = converter.resample(mono, mono.size)

        assertEquals(4, count)
        assertEquals(listOf<Short>(1, 2, 3, 4), out.take(count))
    }

    @Test
    fun `one second of 48 kHz turns into about 16000 samples`() {
        val converter = Mono16k(sourceRate = 48_000, channels = 1)
        val chunk = ShortArray(4800)
        var produced = 0

        // Десять буферов по 0.1 с — состояние обязано переноситься между вызовами.
        repeat(10) {
            produced += converter.resample(chunk, chunk.size).second
        }

        assertTrue("got $produced", abs(produced - 16_000) <= 2)
    }

    @Test
    fun `a ramp stays monotone across buffer boundaries`() {
        val converter = Mono16k(sourceRate = 32_000, channels = 1)
        val collected = mutableListOf<Short>()
        var value = 0

        repeat(4) {
            val chunk = ShortArray(1000) { (value + it).toShort() }
            value += 1000
            val (out, count) = converter.resample(chunk, count = 1000)
            for (i in 0 until count) collected.add(out[i])
        }

        // Ровно вдвое реже исходника и без разрывов на стыках буферов.
        assertTrue("got ${collected.size}", abs(collected.size - 2000) <= 2)
        for (i in 1 until collected.size) {
            val delta = collected[i] - collected[i - 1]
            assertTrue("скачок $delta на позиции $i", delta in 1..3)
        }
    }
}
