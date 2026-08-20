package com.hardelele.recverter.media

import android.content.Context
import android.net.Uri
import android.provider.OpenableColumns

/** Что известно о входящем файле до того, как его открыл MediaExtractor. */
data class SourceInfo(
    val uri: String,
    val name: String,
    val sizeBytes: Long?,
    val mimeType: String?,
) {
    companion object {

        fun of(context: Context, source: Uri): SourceInfo {
            val columns = query(context, source)
            val name = columns?.first
                ?: source.lastPathSegment?.substringAfterLast('/')
                ?: source.toString()
            return SourceInfo(
                uri = source.toString(),
                name = name,
                sizeBytes = columns?.second,
                mimeType = runCatching { context.contentResolver.getType(source) }.getOrNull(),
            )
        }

        private fun query(context: Context, source: Uri): Pair<String?, Long?>? =
            runCatching {
                context.contentResolver.query(
                    source,
                    arrayOf(OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE),
                    null,
                    null,
                    null,
                )?.use { cursor ->
                    if (!cursor.moveToFirst()) return@use null
                    val name = if (cursor.isNull(0)) null else cursor.getString(0)
                    val size = if (cursor.isNull(1)) null else cursor.getLong(1)
                    name to size
                }
            }.getOrNull()
    }
}
