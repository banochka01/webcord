#include "flutter_window.h"

#include <commdlg.h>
#include <dwmapi.h>
#include <mmsystem.h>
#include <shellapi.h>
#include <windows.h>

#include <cstdint>
#include <fstream>
#include <mutex>
#include <optional>
#include <string>
#include <vector>

#include "flutter/generated_plugin_registrant.h"
#include <flutter/standard_method_codec.h>

#ifndef DWMWA_BORDER_COLOR
#define DWMWA_BORDER_COLOR 34
#endif

#ifndef DWMWA_CAPTION_COLOR
#define DWMWA_CAPTION_COLOR 35
#endif

#ifndef DWMWA_TEXT_COLOR
#define DWMWA_TEXT_COLOR 36
#endif

namespace {

std::wstring Utf8ToWide(const std::string& value) {
  if (value.empty()) {
    return std::wstring();
  }
  int size_needed = MultiByteToWideChar(CP_UTF8, 0, value.c_str(),
                                        static_cast<int>(value.size()), NULL, 0);
  std::wstring result(size_needed, 0);
  MultiByteToWideChar(CP_UTF8, 0, value.c_str(), static_cast<int>(value.size()),
                      result.data(), size_needed);
  return result;
}

std::string WideToUtf8(const std::wstring& value) {
  if (value.empty()) {
    return std::string();
  }
  int size_needed = WideCharToMultiByte(CP_UTF8, 0, value.c_str(),
                                        static_cast<int>(value.size()), NULL, 0,
                                        NULL, NULL);
  std::string result(size_needed, 0);
  WideCharToMultiByte(CP_UTF8, 0, value.c_str(), static_cast<int>(value.size()),
                      result.data(), size_needed, NULL, NULL);
  return result;
}

std::string MmError(MMRESULT result) {
  char message[256] = {0};
  if (waveInGetErrorTextA(result, message, sizeof(message)) == MMSYSERR_NOERROR) {
    return std::string(message);
  }
  return "Windows audio capture failed.";
}

const std::string* StringArgument(
    const flutter::MethodCall<flutter::EncodableValue>& call,
    const char* key) {
  const auto* args = std::get_if<flutter::EncodableMap>(call.arguments());
  if (!args) {
    return nullptr;
  }
  auto found = args->find(flutter::EncodableValue(key));
  if (found == args->end()) {
    return nullptr;
  }
  return std::get_if<std::string>(&found->second);
}

std::string PickFile(HWND owner,
                     const wchar_t* filter = L"All Files\0*.*\0") {
  wchar_t file_name[MAX_PATH] = {0};
  OPENFILENAMEW ofn = {0};
  ofn.lStructSize = sizeof(ofn);
  ofn.hwndOwner = owner;
  ofn.lpstrFile = file_name;
  ofn.nMaxFile = MAX_PATH;
  ofn.lpstrFilter = filter;
  ofn.nFilterIndex = 1;
  ofn.Flags = OFN_PATHMUSTEXIST | OFN_FILEMUSTEXIST | OFN_NOCHANGEDIR;

  if (GetOpenFileNameW(&ofn) == TRUE) {
    return WideToUtf8(file_name);
  }
  return std::string();
}

bool OpenUrl(const std::string& url) {
  const auto wide_url = Utf8ToWide(url);
  auto result = reinterpret_cast<intptr_t>(
      ShellExecuteW(nullptr, L"open", wide_url.c_str(), nullptr, nullptr,
                    SW_SHOWNORMAL));
  return result > 32;
}

void ApplyWebCordTitleBar(HWND hwnd) {
  const COLORREF caption = RGB(17, 23, 42);
  const COLORREF border = RGB(49, 228, 209);
  const COLORREF text = RGB(247, 250, 255);
  DwmSetWindowAttribute(hwnd, DWMWA_CAPTION_COLOR, &caption, sizeof(caption));
  DwmSetWindowAttribute(hwnd, DWMWA_BORDER_COLOR, &border, sizeof(border));
  DwmSetWindowAttribute(hwnd, DWMWA_TEXT_COLOR, &text, sizeof(text));
}

void WriteWavHeader(std::ofstream& stream, const WAVEFORMATEX& format,
                    uint32_t data_size) {
  const uint32_t riff_size = 36 + data_size;
  const uint32_t byte_rate = format.nAvgBytesPerSec;
  const uint16_t block_align = format.nBlockAlign;
  const uint16_t bits_per_sample = format.wBitsPerSample;
  const uint16_t channels = format.nChannels;
  const uint32_t sample_rate = format.nSamplesPerSec;
  const uint32_t fmt_size = 16;
  const uint16_t audio_format = 1;

  stream.write("RIFF", 4);
  stream.write(reinterpret_cast<const char*>(&riff_size), sizeof(riff_size));
  stream.write("WAVE", 4);
  stream.write("fmt ", 4);
  stream.write(reinterpret_cast<const char*>(&fmt_size), sizeof(fmt_size));
  stream.write(reinterpret_cast<const char*>(&audio_format),
               sizeof(audio_format));
  stream.write(reinterpret_cast<const char*>(&channels), sizeof(channels));
  stream.write(reinterpret_cast<const char*>(&sample_rate),
               sizeof(sample_rate));
  stream.write(reinterpret_cast<const char*>(&byte_rate), sizeof(byte_rate));
  stream.write(reinterpret_cast<const char*>(&block_align), sizeof(block_align));
  stream.write(reinterpret_cast<const char*>(&bits_per_sample),
               sizeof(bits_per_sample));
  stream.write("data", 4);
  stream.write(reinterpret_cast<const char*>(&data_size), sizeof(data_size));
}

std::wstring TempRecordingPath() {
  wchar_t directory[MAX_PATH] = {0};
  GetTempPathW(MAX_PATH, directory);
  return std::wstring(directory) + L"voice-message-" +
         std::to_wstring(GetTickCount64()) + L".wav";
}

class WaveRecorder {
 public:
  bool Start(std::string* path, std::string* error) {
    if (wave_in_ != nullptr) {
      *error = "Audio recording is already active.";
      return false;
    }

    format_ = {};
    format_.wFormatTag = WAVE_FORMAT_PCM;
    format_.nChannels = 1;
    format_.nSamplesPerSec = 44100;
    format_.wBitsPerSample = 16;
    format_.nBlockAlign =
        static_cast<WORD>(format_.nChannels * format_.wBitsPerSample / 8);
    format_.nAvgBytesPerSec = format_.nSamplesPerSec * format_.nBlockAlign;

    path_ = TempRecordingPath();
    data_size_ = 0;
    stream_.open(path_, std::ios::binary | std::ios::trunc);
    if (!stream_.is_open()) {
      *error = "Could not create a temporary audio file.";
      return false;
    }
    WriteWavHeader(stream_, format_, 0);

    auto mm = waveInOpen(&wave_in_, WAVE_MAPPER, &format_,
                         reinterpret_cast<DWORD_PTR>(&WaveRecorder::Callback),
                         reinterpret_cast<DWORD_PTR>(this), CALLBACK_FUNCTION);
    if (mm != MMSYSERR_NOERROR) {
      Cleanup(false);
      *error = MmError(mm);
      return false;
    }

    constexpr size_t buffer_count = 4;
    const DWORD buffer_size = format_.nAvgBytesPerSec / 5;
    buffers_.resize(buffer_count);
    headers_.resize(buffer_count);
    for (size_t index = 0; index < buffer_count; ++index) {
      buffers_[index].resize(buffer_size);
      headers_[index] = {};
      headers_[index].lpData = buffers_[index].data();
      headers_[index].dwBufferLength = buffer_size;
      mm = waveInPrepareHeader(wave_in_, &headers_[index], sizeof(WAVEHDR));
      if (mm != MMSYSERR_NOERROR) {
        Cleanup(false);
        *error = MmError(mm);
        return false;
      }
      mm = waveInAddBuffer(wave_in_, &headers_[index], sizeof(WAVEHDR));
      if (mm != MMSYSERR_NOERROR) {
        Cleanup(false);
        *error = MmError(mm);
        return false;
      }
    }

    recording_ = true;
    mm = waveInStart(wave_in_);
    if (mm != MMSYSERR_NOERROR) {
      Cleanup(false);
      *error = MmError(mm);
      return false;
    }

    *path = WideToUtf8(path_);
    return true;
  }

  bool Stop(bool keep_file, std::string* path, std::string* error) {
    if (wave_in_ == nullptr) {
      *path = "";
      return true;
    }

    {
      std::lock_guard<std::mutex> lock(mutex_);
      recording_ = false;
    }

    waveInStop(wave_in_);
    waveInReset(wave_in_);
    for (auto& header : headers_) {
      if ((header.dwFlags & WHDR_PREPARED) == WHDR_PREPARED) {
        waveInUnprepareHeader(wave_in_, &header, sizeof(WAVEHDR));
      }
    }
    waveInClose(wave_in_);
    wave_in_ = nullptr;

    {
      std::lock_guard<std::mutex> lock(mutex_);
      if (stream_.is_open()) {
        stream_.seekp(0, std::ios::beg);
        WriteWavHeader(stream_, format_, data_size_);
        stream_.close();
      }
    }

    const auto completed_path = path_;
    Cleanup(keep_file);
    if (keep_file) {
      *path = WideToUtf8(completed_path);
    } else {
      DeleteFileW(completed_path.c_str());
      *path = "";
    }
    return true;
  }

 private:
  static void CALLBACK Callback(HWAVEIN, UINT message, DWORD_PTR instance,
                                DWORD_PTR parameter1, DWORD_PTR) {
    if (message != WIM_DATA || instance == 0) {
      return;
    }
    auto* recorder = reinterpret_cast<WaveRecorder*>(instance);
    auto* header = reinterpret_cast<WAVEHDR*>(parameter1);
    recorder->OnData(header);
  }

  void OnData(WAVEHDR* header) {
    std::lock_guard<std::mutex> lock(mutex_);
    if (!recording_ || wave_in_ == nullptr || !stream_.is_open()) {
      return;
    }
    if (header->dwBytesRecorded > 0) {
      stream_.write(header->lpData, header->dwBytesRecorded);
      data_size_ += header->dwBytesRecorded;
    }
    header->dwBytesRecorded = 0;
    waveInAddBuffer(wave_in_, header, sizeof(WAVEHDR));
  }

  void Cleanup(bool keep_stream) {
    if (wave_in_ != nullptr) {
      waveInReset(wave_in_);
      for (auto& header : headers_) {
        if ((header.dwFlags & WHDR_PREPARED) == WHDR_PREPARED) {
          waveInUnprepareHeader(wave_in_, &header, sizeof(WAVEHDR));
        }
      }
      waveInClose(wave_in_);
      wave_in_ = nullptr;
    }
    if (!keep_stream && stream_.is_open()) {
      stream_.close();
    }
    buffers_.clear();
    headers_.clear();
    recording_ = false;
  }

  HWAVEIN wave_in_ = nullptr;
  WAVEFORMATEX format_ = {};
  std::ofstream stream_;
  std::wstring path_;
  std::vector<std::vector<char>> buffers_;
  std::vector<WAVEHDR> headers_;
  std::mutex mutex_;
  bool recording_ = false;
  uint32_t data_size_ = 0;
};

WaveRecorder g_audio_recorder;

}  // namespace

FlutterWindow::FlutterWindow(const flutter::DartProject& project)
    : project_(project) {}

FlutterWindow::~FlutterWindow() {}

bool FlutterWindow::OnCreate() {
  if (!Win32Window::OnCreate()) {
    return false;
  }
  ApplyWebCordTitleBar(GetHandle());

  RECT frame = GetClientArea();

  // The size here must match the window dimensions to avoid unnecessary surface
  // creation / destruction in the startup path.
  flutter_controller_ = std::make_unique<flutter::FlutterViewController>(
      frame.right - frame.left, frame.bottom - frame.top, project_);
  // Ensure that basic setup of the controller was successful.
  if (!flutter_controller_->engine() || !flutter_controller_->view()) {
    return false;
  }
  RegisterPlugins(flutter_controller_->engine());
  native_channel_ =
      std::make_unique<flutter::MethodChannel<flutter::EncodableValue>>(
          flutter_controller_->engine()->messenger(), "webcord/native",
          &flutter::StandardMethodCodec::GetInstance());
  native_channel_->SetMethodCallHandler(
      [this](const auto& call, auto result) {
        if (call.method_name() == "pickFile") {
          const auto path = PickFile(GetHandle());
          if (path.empty()) {
            result->Success(flutter::EncodableValue());
          } else {
            result->Success(flutter::EncodableValue(path));
          }
          return;
        }
        if (call.method_name() == "openUrl") {
          const auto* url = StringArgument(call, "url");
          result->Success(flutter::EncodableValue(url ? OpenUrl(*url) : false));
          return;
        }
        if (call.method_name() == "startAudioRecording") {
          std::string path;
          std::string error;
          if (g_audio_recorder.Start(&path, &error)) {
            result->Success(flutter::EncodableValue(path));
          } else {
            result->Error("AUDIO_RECORDING_FAILED", error);
          }
          return;
        }
        if (call.method_name() == "stopAudioRecording") {
          std::string path;
          std::string error;
          if (g_audio_recorder.Stop(true, &path, &error)) {
            if (path.empty()) {
              result->Success(flutter::EncodableValue());
            } else {
              result->Success(flutter::EncodableValue(path));
            }
          } else {
            result->Error("AUDIO_RECORDING_FAILED", error);
          }
          return;
        }
        if (call.method_name() == "cancelAudioRecording") {
          std::string path;
          std::string error;
          g_audio_recorder.Stop(false, &path, &error);
          result->Success(flutter::EncodableValue());
          return;
        }
        if (call.method_name() == "captureCircleVideo") {
          const auto path =
              PickFile(GetHandle(),
                       L"Video Files\0*.mp4;*.mov;*.mkv;*.webm;*.avi\0All "
                       L"Files\0*.*\0");
          if (path.empty()) {
            result->Success(flutter::EncodableValue());
          } else {
            result->Success(flutter::EncodableValue(path));
          }
          return;
        }
        result->NotImplemented();
      });
  SetChildContent(flutter_controller_->view()->GetNativeWindow());

  flutter_controller_->engine()->SetNextFrameCallback([&]() {
    this->Show();
  });

  // Flutter can complete the first frame before the "show window" callback is
  // registered. The following call ensures a frame is pending to ensure the
  // window is shown. It is a no-op if the first frame hasn't completed yet.
  flutter_controller_->ForceRedraw();

  return true;
}

void FlutterWindow::OnDestroy() {
  if (flutter_controller_) {
    native_channel_ = nullptr;
    flutter_controller_ = nullptr;
  }

  Win32Window::OnDestroy();
}

LRESULT
FlutterWindow::MessageHandler(HWND hwnd, UINT const message,
                              WPARAM const wparam,
                              LPARAM const lparam) noexcept {
  // Give Flutter, including plugins, an opportunity to handle window messages.
  if (flutter_controller_) {
    std::optional<LRESULT> result =
        flutter_controller_->HandleTopLevelWindowProc(hwnd, message, wparam,
                                                      lparam);
    if (result) {
      return *result;
    }
  }

  switch (message) {
    case WM_FONTCHANGE:
      flutter_controller_->engine()->ReloadSystemFonts();
      break;
  }

  return Win32Window::MessageHandler(hwnd, message, wparam, lparam);
}
