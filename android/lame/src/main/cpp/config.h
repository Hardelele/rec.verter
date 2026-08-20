/*
 * config.h для сборки LAME под Android без autoconf.
 *
 * Оригинальный config.h генерируется ./configure на хосте; для кросс-компиляции
 * NDK его проще написать руками, чем гонять configure под каждый ABI. Здесь
 * только то, что реально влияет на энкодер: типы, порядок байт и наличие
 * заголовков libc — всё это одинаково у всех Android ABI (bionic, little-endian).
 *
 * Декодер (mpglib) не собирается: DECODE_ON_THE_FLY и HAVE_MPGLIB не определены,
 * поэтому в библиотеке остаётся только кодирование.
 */

#ifndef RECVERTER_LAME_CONFIG_H
#define RECVERTER_LAME_CONFIG_H

#define PACKAGE "lame"
#define VERSION "3.100"

#define STDC_HEADERS 1

#define HAVE_ERRNO_H 1
#define HAVE_FCNTL_H 1
#define HAVE_INTTYPES_H 1
#define HAVE_LIMITS_H 1
#define HAVE_MEMORY_H 1
#define HAVE_STDINT_H 1
#define HAVE_STDLIB_H 1
#define HAVE_STRING_H 1
#define HAVE_STRINGS_H 1
#define HAVE_SYS_STAT_H 1
#define HAVE_SYS_TYPES_H 1
#define HAVE_UNISTD_H 1

#define HAVE_MEMCPY 1
#define HAVE_STRCHR 1

#define SIZEOF_SHORT 2
#define SIZEOF_UNSIGNED_SHORT 2
#define SIZEOF_INT 4
#define SIZEOF_UNSIGNED_INT 4
#define SIZEOF_LONG_LONG 8
#define SIZEOF_UNSIGNED_LONG_LONG 8
#define SIZEOF_FLOAT 4
#define SIZEOF_DOUBLE 8

/* LP64 на 64-битных ABI, ILP32 на 32-битных: разницу знает только компилятор. */
#if defined(__LP64__)
#define SIZEOF_LONG 8
#define SIZEOF_UNSIGNED_LONG 8
#define SIZEOF_LONG_DOUBLE 16
#else
#define SIZEOF_LONG 4
#define SIZEOF_UNSIGNED_LONG 4
#define SIZEOF_LONG_DOUBLE 8
#endif

typedef float ieee754_float32_t;
typedef double ieee754_float64_t;
typedef long double ieee854_float80_t;

/*
 * Быстрая ветка квантования читает биты float напрямую. Работает только при
 * IEEE-754 и little-endian — у всех поддерживаемых Android ABI это так.
 */
#define TAKEHIRO_IEEE754_HACK 1

/* WORDS_BIGENDIAN не определён намеренно: Android ABI все little-endian. */

#endif /* RECVERTER_LAME_CONFIG_H */
