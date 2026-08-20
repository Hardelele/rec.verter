package com.hardelele.recverter.bridge

import android.net.Uri
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.module.annotations.ReactModule
import com.hardelele.recverter.media.ConvertOptions
import com.hardelele.recverter.media.Converter
import com.hardelele.recverter.media.MediaError
import com.hardelele.recverter.media.MediaErrorCode
import com.hardelele.recverter.media.ProgressSink
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean

@ReactModule(name = RecverterModule.NAME)
class RecverterModule(
    private val context: ReactApplicationContext,
) : ReactContextBaseJavaModule(context) {

    private val worker = Executors.newSingleThreadExecutor()
    private val cancelled = AtomicBoolean(false)

    override fun getName(): String = NAME

    override fun initialize() {
        super.initialize()
        ShareIntake.setListener { uris -> emitShare(uris) }
    }

    override fun invalidate() {
        ShareIntake.setListener(null)
        cancelled.set(true)
        worker.shutdownNow()
        super.invalidate()
    }

    @ReactMethod
    fun convert(sourceUri: String, format: String, options: ReadableMap?, promise: Promise) {
        cancelled.set(false)
        worker.execute {
            try {
                val result = Converter.convert(
                    context,
                    Uri.parse(sourceUri),
                    format,
                    optionsOf(options),
                    progressSink(),
                )
                promise.resolve(
                    Arguments.createMap().apply {
                        putString("path", result.path)
                        putString("mimeType", result.mimeType)
                        putDouble("durationMs", result.durationMs.toDouble())
                        putDouble("sizeBytes", result.sizeBytes.toDouble())
                    },
                )
            } catch (e: MediaError) {
                promise.reject(e.code.name, e.message, e)
            } catch (e: Throwable) {
                promise.reject(MediaErrorCode.CORRUPTED_SOURCE.name, e.message, e)
            }
        }
    }

    @ReactMethod
    fun cancel() {
        cancelled.set(true)
    }

    @ReactMethod
    fun getInitialShare(promise: Promise) {
        val fromIntent = ShareIntake.urisOf(context.currentActivity?.intent)
        val held = ShareIntake.take()
        val uris = if (held.isNotEmpty()) held else fromIntent
        promise.resolve(Arguments.fromList(uris))
    }

    // NativeEventEmitter требует эти методы на модуле; подписка ведётся на стороне JS.
    @ReactMethod
    fun addListener(eventName: String) = Unit

    @ReactMethod
    fun removeListeners(count: Double) = Unit

    private fun optionsOf(options: ReadableMap?): ConvertOptions = ConvertOptions(
        bitrateKbps = if (options?.hasKey("bitrateKbps") == true) {
            options.getInt("bitrateKbps")
        } else {
            192
        },
        mono16k = options?.hasKey("mono16k") == true && options.getBoolean("mono16k"),
    )

    private fun progressSink(): ProgressSink = object : ProgressSink {
        private var lastEmitAt = 0L
        private var lastValue = -1f

        override fun onProgress(fraction: Float) {
            val now = System.currentTimeMillis()
            val final = fraction >= 1f
            if (!final && (now - lastEmitAt < PROGRESS_INTERVAL_MS || fraction - lastValue < 0.005f)) {
                return
            }
            lastEmitAt = now
            lastValue = fraction
            emit(EVENT_PROGRESS, Arguments.createMap().apply {
                putDouble("progress", fraction.toDouble())
            })
        }

        override fun isCancelled(): Boolean = cancelled.get()
    }

    private fun emitShare(uris: List<String>) {
        emit(EVENT_SHARE, Arguments.createMap().apply {
            putArray("uris", Arguments.fromList(uris))
        })
    }

    private fun emit(event: String, payload: Any) {
        if (!context.hasActiveReactInstance()) return
        runCatching { context.emitDeviceEvent(event, payload) }
    }

    companion object {
        const val NAME = "Recverter"
        private const val EVENT_PROGRESS = "recverter:progress"
        private const val EVENT_SHARE = "recverter:share"
        private const val PROGRESS_INTERVAL_MS = 100L
    }
}
