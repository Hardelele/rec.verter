# Add project specific ProGuard rules here.
# By default, the flags in this file are appended to flags specified
# in /usr/local/Cellar/android-sdk/24.3.3/tools/proguard/proguard-android.txt
# You can edit the include path and order by changing the proguardFiles
# directive in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# react-native-reanimated
-keep class com.swmansion.reanimated.** { *; }
-keep class com.facebook.react.turbomodule.** { *; }

# LAME связывается через RegisterNatives в JNI_OnLoad, а не по схеме Java_...,
# поэтому C-код ищет класс и методы по строковым именам. R8 о таком связывании
# не знает и переименовал бы их — тогда System.loadLibrary пройдёт, а первый же
# вызов упадёт UnsatisfiedLinkError уже на устройстве.
-keep class com.hardelele.recverter.lame.Lame { *; }

# Add any project specific keep options here:
