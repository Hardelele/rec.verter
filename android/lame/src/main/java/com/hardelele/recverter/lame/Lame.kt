package com.hardelele.recverter.lame

/**
 * Сырая поверхность LAME: дескриптор, кодирование буфера, слив хвоста. Ни файла,
 * ни прогресса, ни политики — они живут в media/Mp3Encoder.kt.
 *
 * Имена методов не подчиняются схеме Java_..., связывание идёт через RegisterNatives
 * в JNI_OnLoad: так символы не зависят от пакета и не торчат наружу из .so.
 */
object Lame {

    /** Не бросается: если библиотеки нет, [available] останется false, а вызов — ошибкой. */
    val available: Boolean = runCatching { System.loadLibrary("lamemp3") }.isSuccess

    /** Рекомендованный запас под выход энкодера для [frames] кадров (формула из API LAME). */
    fun outputCapacity(frames: Int): Int = (frames * 5 / 4) + 7_200

    /**
     * @param quality 0 — лучше и медленнее, 9 — быстрее и хуже; 2 — рабочая точка LAME.
     * @return дескриптор или 0, если LAME не принял параметры.
     */
    external fun nativeInit(sampleRate: Int, channels: Int, bitrateKbps: Int, quality: Int): Long

    /** Частота на выходе: LAME сам понижает её, если битрейт не тянет исходную. */
    external fun nativeOutSampleRate(handle: Long): Int

    /** @return сколько байт MP3 записано в [out], или отрицательное — при ошибке. */
    external fun nativeEncode(
        handle: Long,
        pcm: ByteArray,
        pcmBytes: Int,
        out: ByteArray,
        outCapacity: Int,
    ): Int

    external fun nativeFlush(handle: Long, out: ByteArray, outCapacity: Int): Int

    /** Кадр Xing/LAME, который кладётся поверх первого кадра файла. */
    external fun nativeLametagFrame(handle: Long, out: ByteArray, outCapacity: Int): Int

    external fun nativeClose(handle: Long)
}
