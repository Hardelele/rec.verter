cmake_minimum_required(VERSION 3.22.1)
project(lamemp3 C)

# Только энкодер: mpglib и mpglib_interface.c не вендорятся вовсе, DECODE_ON_THE_FLY
# не определяется. Патенты на MP3 истекли в 2017, лицензия LAME — LGPL 2.1
# (текст в lame/COPYING), библиотека линкуется динамически.
file(GLOB LAME_SOURCES ${CMAKE_CURRENT_SOURCE_DIR}/lame/*.c)

add_library(lamemp3 SHARED
        lame_jni.c
        ${LAME_SOURCES}
)

target_include_directories(lamemp3 PRIVATE
        ${CMAKE_CURRENT_SOURCE_DIR}
        ${CMAKE_CURRENT_SOURCE_DIR}/lame
)

target_compile_definitions(lamemp3 PRIVATE HAVE_CONFIG_H)

# Предупреждения апстрима не наши: LAME 3.100 написан в 1998–2017 и на свежем
# clang шумит. Гасим точечно, а не -w, чтобы ошибки в lame_jni.c были видны.
target_compile_options(lamemp3 PRIVATE
        # -O3 задан явно: в debug AGP ставит -O0, а на нём кодирование часа звука
        # превращается в минуты. -ffast-math не берём — TAKEHIRO_IEEE754_HACK читает
        # биты float напрямую, и вольности с плавающей точкой ему противопоказаны.
        -O3
        -fvisibility=hidden
        -Wno-absolute-value
        -Wno-shift-negative-value
        -Wno-implicit-function-declaration
        -Wno-deprecated-non-prototype
        -Wno-pointer-sign
)

# Требование Google Play с 01.11.2025: нативные библиотеки должны работать при
# размере страницы 16 КБ. NDK r27 ставит это выравнивание по умолчанию, флаг
# оставлен явно — чтобы условие не зависело от версии тулчейна.
target_link_options(lamemp3 PRIVATE "-Wl,-z,max-page-size=16384")

target_link_libraries(lamemp3 m)
