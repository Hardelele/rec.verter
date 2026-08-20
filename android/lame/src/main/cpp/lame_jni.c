/*
 * Тонкая обёртка над LAME: никакой логики, только перевод типов JNI ↔ C.
 * Всё, что можно решить на Kotlin (буферы, файл, прогресс, отмена), решается там.
 */

#include <jni.h>
#include <stdlib.h>
#include <string.h>

#include "lame/lame.h"

#define CLASS "com/hardelele/recverter/lame/Lame"

static lame_global_flags *unwrap(jlong handle) {
    return (lame_global_flags *) (intptr_t) handle;
}

static jlong nativeInit(
        JNIEnv *env, jclass clazz,
        jint sampleRate, jint channels, jint bitrateKbps, jint quality) {
    (void) env;
    (void) clazz;

    lame_global_flags *gfp = lame_init();
    if (gfp == NULL) return 0;

    lame_set_in_samplerate(gfp, sampleRate);
    lame_set_num_channels(gfp, channels);
    lame_set_out_samplerate(gfp, 0); /* 0 — пусть LAME сам подберёт допустимую частоту */
    lame_set_brate(gfp, bitrateKbps);
    lame_set_VBR(gfp, vbr_off); /* постоянный битрейт: длительность считается по размеру */
    lame_set_quality(gfp, quality);
    lame_set_mode(gfp, channels == 1 ? MONO : JOINT_STEREO);
    /* Тегов нет и не будет: ID3 не пишем, чтобы поток начинался сразу с аудио. */
    lame_set_write_id3tag_automatic(gfp, 0);
    /* Заголовок Xing/LAME включён: первый кадр — заглушка, её перезаписывает lametagFrame. */
    lame_set_bWriteVbrTag(gfp, 1);

    if (lame_init_params(gfp) < 0) {
        lame_close(gfp);
        return 0;
    }
    return (jlong) (intptr_t) gfp;
}

static jint nativeOutSampleRate(JNIEnv *env, jclass clazz, jlong handle) {
    (void) env;
    (void) clazz;
    lame_global_flags *gfp = unwrap(handle);
    return gfp == NULL ? 0 : lame_get_out_samplerate(gfp);
}

/*
 * pcm — чередующиеся 16-битные сэмплы little-endian ровно в том виде, в каком их
 * отдаёт MediaCodec. Все Android ABI little-endian, поэтому байты читаются как
 * short без перестановки.
 */
static jint nativeEncode(
        JNIEnv *env, jclass clazz,
        jlong handle, jbyteArray pcm, jint pcmBytes, jbyteArray out, jint outCapacity) {
    (void) clazz;
    lame_global_flags *gfp = unwrap(handle);
    if (gfp == NULL) return -1;

    jbyte *in = (*env)->GetPrimitiveArrayCritical(env, pcm, NULL);
    if (in == NULL) return -1;
    jbyte *dst = (*env)->GetPrimitiveArrayCritical(env, out, NULL);
    if (dst == NULL) {
        (*env)->ReleasePrimitiveArrayCritical(env, pcm, in, JNI_ABORT);
        return -1;
    }

    const int channels = lame_get_num_channels(gfp);
    const int samples = (int) (pcmBytes / 2);
    const int frames = channels > 0 ? samples / channels : 0;

    int written;
    if (channels == 1) {
        written = lame_encode_buffer(
                gfp, (short *) in, (short *) in, frames,
                (unsigned char *) dst, outCapacity);
    } else {
        written = lame_encode_buffer_interleaved(
                gfp, (short *) in, frames,
                (unsigned char *) dst, outCapacity);
    }

    (*env)->ReleasePrimitiveArrayCritical(env, out, dst, 0);
    (*env)->ReleasePrimitiveArrayCritical(env, pcm, in, JNI_ABORT);
    return written;
}

static jint nativeFlush(
        JNIEnv *env, jclass clazz, jlong handle, jbyteArray out, jint outCapacity) {
    (void) clazz;
    lame_global_flags *gfp = unwrap(handle);
    if (gfp == NULL) return -1;

    jbyte *dst = (*env)->GetPrimitiveArrayCritical(env, out, NULL);
    if (dst == NULL) return -1;
    int written = lame_encode_flush(gfp, (unsigned char *) dst, outCapacity);
    (*env)->ReleasePrimitiveArrayCritical(env, out, dst, 0);
    return written;
}

/* Готовый кадр Xing/LAME; вызывающий обязан положить его поверх первого кадра файла. */
static jint nativeLametagFrame(
        JNIEnv *env, jclass clazz, jlong handle, jbyteArray out, jint outCapacity) {
    (void) clazz;
    lame_global_flags *gfp = unwrap(handle);
    if (gfp == NULL) return 0;

    jbyte *dst = (*env)->GetPrimitiveArrayCritical(env, out, NULL);
    if (dst == NULL) return 0;
    size_t written = lame_get_lametag_frame(gfp, (unsigned char *) dst, (size_t) outCapacity);
    (*env)->ReleasePrimitiveArrayCritical(env, out, dst, 0);
    return (jint) written;
}

static void nativeClose(JNIEnv *env, jclass clazz, jlong handle) {
    (void) env;
    (void) clazz;
    lame_global_flags *gfp = unwrap(handle);
    if (gfp != NULL) lame_close(gfp);
}

static const JNINativeMethod METHODS[] = {
        {"nativeInit",          "(IIII)J",   (void *) nativeInit},
        {"nativeOutSampleRate", "(J)I",      (void *) nativeOutSampleRate},
        {"nativeEncode",        "(J[BI[BI)I", (void *) nativeEncode},
        {"nativeFlush",         "(J[BI)I",   (void *) nativeFlush},
        {"nativeLametagFrame",  "(J[BI)I",   (void *) nativeLametagFrame},
        {"nativeClose",         "(J)V",      (void *) nativeClose},
};

JNIEXPORT jint JNICALL JNI_OnLoad(JavaVM *vm, void *reserved) {
    (void) reserved;
    JNIEnv *env = NULL;
    if ((*vm)->GetEnv(vm, (void **) &env, JNI_VERSION_1_6) != JNI_OK) return JNI_ERR;

    jclass clazz = (*env)->FindClass(env, CLASS);
    if (clazz == NULL) return JNI_ERR;
    if ((*env)->RegisterNatives(
            env, clazz, METHODS, sizeof(METHODS) / sizeof(METHODS[0])) != JNI_OK) {
        return JNI_ERR;
    }
    return JNI_VERSION_1_6;
}
