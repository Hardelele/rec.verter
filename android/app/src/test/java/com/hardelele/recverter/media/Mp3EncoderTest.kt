package com.hardelele.recverter.media

import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * Само кодирование проверяется на устройстве: LAME — нативный код, в JVM его нет.
 * Здесь только выбор битрейта — та часть, где ошибка тихо испортит каждый файл.
 */
class Mp3EncoderTest {

    @Test
    fun keepsSupportedBitrates() {
        for (kbps in Mp3Encoder.BITRATES) {
            assertEquals(kbps, Mp3Encoder.nearestBitrate(kbps))
        }
    }

    @Test
    fun snapsUnsupportedBitrateToNearest() {
        assertEquals(128, Mp3Encoder.nearestBitrate(96))
        assertEquals(128, Mp3Encoder.nearestBitrate(150))
        assertEquals(192, Mp3Encoder.nearestBitrate(170))
        assertEquals(192, Mp3Encoder.nearestBitrate(250))
        assertEquals(320, Mp3Encoder.nearestBitrate(260))
        assertEquals(320, Mp3Encoder.nearestBitrate(1_000))
    }

    @Test
    fun survivesNonsense() {
        assertEquals(128, Mp3Encoder.nearestBitrate(0))
        assertEquals(128, Mp3Encoder.nearestBitrate(-5))
    }
}
