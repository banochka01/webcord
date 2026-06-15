package com.webcord.webcord_native

import android.Manifest
import android.app.Activity
import android.content.ContentValues
import android.content.Intent
import android.content.pm.PackageManager
import android.media.MediaRecorder
import android.net.Uri
import android.os.Build
import android.provider.OpenableColumns
import android.provider.MediaStore
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.embedding.android.FlutterActivity
import io.flutter.plugin.common.MethodChannel
import java.io.File
import java.io.FileOutputStream

class MainActivity : FlutterActivity() {
    private var pendingPickResult: MethodChannel.Result? = null
    private var pendingAudioStartResult: MethodChannel.Result? = null
    private var pendingVideoResult: MethodChannel.Result? = null
    private var pendingVideoUri: Uri? = null
    private var audioRecorder: MediaRecorder? = null
    private var audioOutputPath: String? = null

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)

        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, "webcord/native").setMethodCallHandler { call, result ->
            when (call.method) {
                "getString" -> result.success(preferences().getString(call.argument<String>("key"), null))
                "setString" -> {
                    preferences().edit()
                        .putString(call.argument<String>("key"), call.argument<String>("value") ?: "")
                        .apply()
                    result.success(null)
                }
                "getInt" -> {
                    val key = call.argument<String>("key")
                    if (key != null && preferences().contains(key)) {
                        result.success(preferences().getInt(key, 0))
                    } else {
                        result.success(null)
                    }
                }
                "setInt" -> {
                    preferences().edit()
                        .putInt(call.argument<String>("key"), call.argument<Int>("value") ?: 0)
                        .apply()
                    result.success(null)
                }
                "remove" -> {
                    preferences().edit().remove(call.argument<String>("key")).apply()
                    result.success(null)
                }
                "pickFile" -> pickFile(result)
                "openUrl" -> result.success(openUrl(call.argument<String>("url")))
                "startAudioRecording" -> startAudioRecording(result)
                "stopAudioRecording" -> stopAudioRecording(result)
                "cancelAudioRecording" -> cancelAudioRecording(result)
                "captureCircleVideo" -> captureCircleVideo(result)
                else -> result.notImplemented()
            }
        }
    }

    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        when (requestCode) {
            PICK_FILE_REQUEST -> {
                val result = pendingPickResult ?: return
                pendingPickResult = null

                if (resultCode != Activity.RESULT_OK || data?.data == null) {
                    result.success(null)
                    return
                }

                try {
                    result.success(copyUriToCache(data.data!!))
                } catch (error: Exception) {
                    result.error("PICK_FILE_FAILED", error.message, null)
                }
            }
            CAPTURE_VIDEO_REQUEST -> {
                val result = pendingVideoResult ?: return
                val createdUri = pendingVideoUri
                val uri = createdUri ?: data?.data
                pendingVideoResult = null
                pendingVideoUri = null

                if (resultCode != Activity.RESULT_OK || uri == null) {
                    if (createdUri != null) contentResolver.delete(createdUri, null, null)
                    result.success(null)
                    return
                }

                try {
                    val copiedPath = copyUriToCache(uri)
                    if (createdUri != null) contentResolver.delete(createdUri, null, null)
                    result.success(copiedPath)
                } catch (error: Exception) {
                    result.error("VIDEO_CAPTURE_FAILED", error.message, null)
                }
            }
        }
    }

    override fun onRequestPermissionsResult(
        requestCode: Int,
        permissions: Array<out String>,
        grantResults: IntArray
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        val granted = grantResults.firstOrNull() == PackageManager.PERMISSION_GRANTED
        when (requestCode) {
            RECORD_AUDIO_PERMISSION_REQUEST -> {
                val result = pendingAudioStartResult ?: return
                pendingAudioStartResult = null
                if (granted) {
                    startAudioRecording(result)
                } else {
                    result.error("MIC_PERMISSION_DENIED", "Microphone permission was denied.", null)
                }
            }
            CAMERA_PERMISSION_REQUEST -> {
                val result = pendingVideoResult ?: return
                pendingVideoResult = null
                if (granted) {
                    captureCircleVideo(result)
                } else {
                    result.error("CAMERA_PERMISSION_DENIED", "Camera permission was denied.", null)
                }
            }
        }
    }

    private fun preferences() = getSharedPreferences("webcord_native", MODE_PRIVATE)

    private fun pickFile(result: MethodChannel.Result) {
        if (pendingPickResult != null) {
            result.error("PICK_IN_PROGRESS", "A file picker is already open.", null)
            return
        }

        pendingPickResult = result
        val intent = Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
            addCategory(Intent.CATEGORY_OPENABLE)
            type = "*/*"
        }
        startActivityForResult(intent, PICK_FILE_REQUEST)
    }

    private fun openUrl(url: String?): Boolean {
        if (url.isNullOrBlank()) return false
        return try {
            startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
            true
        } catch (_: Exception) {
            false
        }
    }

    private fun startAudioRecording(result: MethodChannel.Result) {
        if (!hasPermission(Manifest.permission.RECORD_AUDIO)) {
            pendingAudioStartResult = result
            requestPermissions(arrayOf(Manifest.permission.RECORD_AUDIO), RECORD_AUDIO_PERMISSION_REQUEST)
            return
        }
        if (audioRecorder != null) {
            result.error("AUDIO_RECORDING_ACTIVE", "Audio recording is already active.", null)
            return
        }

        try {
            val target = File(cacheDir, "voice-message-${System.currentTimeMillis()}.m4a")
            val recorder = newMediaRecorder().apply {
                setAudioSource(MediaRecorder.AudioSource.MIC)
                setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
                setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
                setAudioEncodingBitRate(128_000)
                setAudioSamplingRate(44_100)
                setOutputFile(target.absolutePath)
                prepare()
                start()
            }
            audioRecorder = recorder
            audioOutputPath = target.absolutePath
            result.success(target.absolutePath)
        } catch (error: Exception) {
            releaseAudioRecorder()
            result.error("AUDIO_RECORDING_FAILED", error.message, null)
        }
    }

    private fun stopAudioRecording(result: MethodChannel.Result) {
        val recorder = audioRecorder
        val path = audioOutputPath
        if (recorder == null || path == null) {
            result.success(null)
            return
        }

        try {
            recorder.stop()
            result.success(path)
        } catch (error: Exception) {
            File(path).delete()
            result.error("AUDIO_RECORDING_FAILED", error.message, null)
        } finally {
            releaseAudioRecorder()
        }
    }

    private fun cancelAudioRecording(result: MethodChannel.Result) {
        val path = audioOutputPath
        try {
            audioRecorder?.stop()
        } catch (_: Exception) {
        } finally {
            releaseAudioRecorder()
            if (path != null) File(path).delete()
            result.success(null)
        }
    }

    private fun captureCircleVideo(result: MethodChannel.Result) {
        if (!hasPermission(Manifest.permission.CAMERA)) {
            pendingVideoResult = result
            requestPermissions(arrayOf(Manifest.permission.CAMERA), CAMERA_PERMISSION_REQUEST)
            return
        }
        if (pendingVideoResult != null) {
            result.error("VIDEO_CAPTURE_ACTIVE", "Video capture is already active.", null)
            return
        }

        val targetName = "circle-video-${System.currentTimeMillis()}.mp4"
        val values = ContentValues().apply {
            put(MediaStore.Video.Media.DISPLAY_NAME, targetName)
            put(MediaStore.Video.Media.MIME_TYPE, "video/mp4")
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                put(MediaStore.Video.Media.RELATIVE_PATH, "Movies/WebCord")
            }
        }
        val outputUri = contentResolver.insert(MediaStore.Video.Media.EXTERNAL_CONTENT_URI, values)
        if (outputUri == null) {
            result.error("VIDEO_CAPTURE_FAILED", "Could not create a video target.", null)
            return
        }

        pendingVideoResult = result
        pendingVideoUri = outputUri
        val intent = Intent(MediaStore.ACTION_VIDEO_CAPTURE).apply {
            putExtra(MediaStore.EXTRA_OUTPUT, outputUri)
            putExtra(MediaStore.EXTRA_DURATION_LIMIT, 60)
            putExtra(MediaStore.EXTRA_VIDEO_QUALITY, 1)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION)
        }

        try {
            startActivityForResult(intent, CAPTURE_VIDEO_REQUEST)
        } catch (error: Exception) {
            pendingVideoResult = null
            pendingVideoUri = null
            contentResolver.delete(outputUri, null, null)
            result.error("VIDEO_CAPTURE_FAILED", error.message, null)
        }
    }

    private fun copyUriToCache(uri: Uri): String {
        val safeName = displayName(uri)
            .replace(Regex("[^a-zA-Z0-9_.-]"), "_")
            .ifBlank { "attachment" }
        val target = File(cacheDir, "webcord-upload-${System.currentTimeMillis()}-$safeName")
        contentResolver.openInputStream(uri).use { input ->
            FileOutputStream(target).use { output ->
                requireNotNull(input) { "Could not open selected file." }.copyTo(output)
            }
        }
        return target.absolutePath
    }

    private fun displayName(uri: Uri): String {
        contentResolver.query(uri, null, null, null, null)?.use { cursor ->
            val index = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
            if (index >= 0 && cursor.moveToFirst()) return cursor.getString(index) ?: "attachment"
        }
        return uri.lastPathSegment ?: "attachment"
    }

    private fun hasPermission(permission: String): Boolean {
        return Build.VERSION.SDK_INT < Build.VERSION_CODES.M ||
            checkSelfPermission(permission) == PackageManager.PERMISSION_GRANTED
    }

    @Suppress("DEPRECATION")
    private fun newMediaRecorder(): MediaRecorder {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            MediaRecorder(this)
        } else {
            MediaRecorder()
        }
    }

    private fun releaseAudioRecorder() {
        try {
            audioRecorder?.release()
        } catch (_: Exception) {
        }
        audioRecorder = null
        audioOutputPath = null
    }

    companion object {
        private const val PICK_FILE_REQUEST = 4801
        private const val CAPTURE_VIDEO_REQUEST = 4802
        private const val RECORD_AUDIO_PERMISSION_REQUEST = 4803
        private const val CAMERA_PERMISSION_REQUEST = 4804
    }
}
