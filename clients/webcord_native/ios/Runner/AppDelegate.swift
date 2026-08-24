import Flutter
import UIKit
import AVFoundation
import UserNotifications

@main
@objc class AppDelegate: FlutterAppDelegate, FlutterImplicitEngineDelegate,
  UIDocumentPickerDelegate, UIImagePickerControllerDelegate,
  UINavigationControllerDelegate {
  private var nativeChannel: FlutterMethodChannel?
  private var pendingDocumentResult: FlutterResult?
  private var pendingVideoResult: FlutterResult?
  private var audioRecorder: AVAudioRecorder?
  private var audioRecordingURL: URL?

  override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
  ) -> Bool {
    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }

  func didInitializeImplicitFlutterEngine(_ engineBridge: FlutterImplicitEngineBridge) {
    GeneratedPluginRegistrant.register(with: engineBridge.pluginRegistry)
    guard let registrar = engineBridge.pluginRegistry.registrar(
      forPlugin: "WebCordNativeBridge"
    ) else { return }

    let channel = FlutterMethodChannel(
      name: "webcord/native",
      binaryMessenger: registrar.messenger()
    )
    channel.setMethodCallHandler { [weak self] call, result in
      self?.handleNativeCall(call, result: result)
    }
    nativeChannel = channel
  }

  private func handleNativeCall(_ call: FlutterMethodCall, result: @escaping FlutterResult) {
    let arguments = call.arguments as? [String: Any]
    switch call.method {
    case "pickFile":
      presentDocumentPicker(result: result)
    case "openUrl":
      guard let rawURL = arguments?["url"] as? String,
            let url = URL(string: rawURL) else {
        result(false)
        return
      }
      UIApplication.shared.open(url, options: [:]) { opened in result(opened) }
    case "startAudioRecording":
      startAudioRecording(result: result)
    case "stopAudioRecording":
      stopAudioRecording(result: result)
    case "cancelAudioRecording":
      cancelAudioRecording()
      result(nil)
    case "captureCircleVideo":
      presentVideoCapture(result: result)
    case "showNotification":
      showNotification(
        title: arguments?["title"] as? String ?? "WebCord",
        body: arguments?["body"] as? String ?? "",
        result: result
      )
    case "getString":
      result(UserDefaults.standard.string(forKey: arguments?["key"] as? String ?? ""))
    case "getInt":
      let key = arguments?["key"] as? String ?? ""
      result((UserDefaults.standard.object(forKey: key) as? NSNumber)?.intValue)
    case "setString":
      guard let key = arguments?["key"] as? String,
            let value = arguments?["value"] as? String else {
        result(FlutterError(code: "INVALID_ARGUMENT", message: "Missing key or value", details: nil))
        return
      }
      UserDefaults.standard.set(value, forKey: key)
      result(nil)
    case "setInt":
      guard let key = arguments?["key"] as? String,
            let value = arguments?["value"] as? NSNumber else {
        result(FlutterError(code: "INVALID_ARGUMENT", message: "Missing key or value", details: nil))
        return
      }
      UserDefaults.standard.set(value.intValue, forKey: key)
      result(nil)
    case "remove":
      if let key = arguments?["key"] as? String {
        UserDefaults.standard.removeObject(forKey: key)
      }
      result(nil)
    default:
      result(FlutterMethodNotImplemented)
    }
  }

  private func presentDocumentPicker(result: @escaping FlutterResult) {
    guard pendingDocumentResult == nil,
          let presenter = topViewController() else {
      result(FlutterError(code: "PICKER_BUSY", message: "Another picker is already open", details: nil))
      return
    }
    pendingDocumentResult = result
    let picker = UIDocumentPickerViewController(documentTypes: ["public.item"], in: .import)
    picker.allowsMultipleSelection = false
    picker.delegate = self
    presenter.present(picker, animated: true)
  }

  func documentPicker(
    _ controller: UIDocumentPickerViewController,
    didPickDocumentsAt urls: [URL]
  ) {
    let result = pendingDocumentResult
    pendingDocumentResult = nil
    result?(urls.first?.path)
  }

  func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) {
    let result = pendingDocumentResult
    pendingDocumentResult = nil
    result?(nil)
  }

  private func startAudioRecording(result: @escaping FlutterResult) {
    AVAudioSession.sharedInstance().requestRecordPermission { [weak self] granted in
      DispatchQueue.main.async {
        guard let self else { return }
        guard granted else {
          result(FlutterError(code: "MICROPHONE_DENIED", message: "Microphone permission was denied", details: nil))
          return
        }
        do {
          let session = AVAudioSession.sharedInstance()
          try session.setCategory(.playAndRecord, mode: .voiceChat, options: [.defaultToSpeaker, .allowBluetooth])
          try session.setActive(true)
          let url = self.temporaryURL(extension: "m4a", prefix: "voice")
          let recorder = try AVAudioRecorder(
            url: url,
            settings: [
              AVFormatIDKey: Int(kAudioFormatMPEG4AAC),
              AVSampleRateKey: 48_000,
              AVNumberOfChannelsKey: 1,
              AVEncoderAudioQualityKey: AVAudioQuality.high.rawValue,
            ]
          )
          guard recorder.prepareToRecord(), recorder.record() else {
            throw NSError(domain: "WebCord", code: 1, userInfo: [NSLocalizedDescriptionKey: "Could not start recording"])
          }
          self.audioRecorder = recorder
          self.audioRecordingURL = url
          result(url.path)
        } catch {
          result(FlutterError(code: "RECORDING_FAILED", message: error.localizedDescription, details: nil))
        }
      }
    }
  }

  private func stopAudioRecording(result: @escaping FlutterResult) {
    audioRecorder?.stop()
    audioRecorder = nil
    let path = audioRecordingURL?.path
    audioRecordingURL = nil
    result(path)
  }

  private func cancelAudioRecording() {
    audioRecorder?.stop()
    audioRecorder = nil
    if let url = audioRecordingURL {
      try? FileManager.default.removeItem(at: url)
    }
    audioRecordingURL = nil
  }

  private func presentVideoCapture(result: @escaping FlutterResult) {
    guard pendingVideoResult == nil,
          UIImagePickerController.isSourceTypeAvailable(.camera),
          let presenter = topViewController() else {
      result(FlutterError(code: "CAMERA_UNAVAILABLE", message: "Camera is unavailable", details: nil))
      return
    }
    pendingVideoResult = result
    let picker = UIImagePickerController()
    picker.sourceType = .camera
    picker.mediaTypes = ["public.movie"]
    picker.cameraCaptureMode = .video
    picker.videoMaximumDuration = 60
    picker.videoQuality = .typeHigh
    picker.delegate = self
    presenter.present(picker, animated: true)
  }

  func imagePickerController(
    _ picker: UIImagePickerController,
    didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]
  ) {
    picker.dismiss(animated: true)
    let result = pendingVideoResult
    pendingVideoResult = nil
    guard let sourceURL = info[.mediaURL] as? URL else {
      result?(nil)
      return
    }
    let destination = temporaryURL(extension: "mov", prefix: "circle")
    do {
      try FileManager.default.copyItem(at: sourceURL, to: destination)
      result?(destination.path)
    } catch {
      result?(FlutterError(code: "VIDEO_COPY_FAILED", message: error.localizedDescription, details: nil))
    }
  }

  func imagePickerControllerDidCancel(_ picker: UIImagePickerController) {
    picker.dismiss(animated: true)
    let result = pendingVideoResult
    pendingVideoResult = nil
    result?(nil)
  }

  private func showNotification(
    title: String,
    body: String,
    result: @escaping FlutterResult
  ) {
    let center = UNUserNotificationCenter.current()
    center.getNotificationSettings { [weak self] settings in
      guard let self else { return }
      if settings.authorizationStatus == .notDetermined {
        center.requestAuthorization(options: [.alert, .badge, .sound]) { granted, _ in
          guard granted else {
            DispatchQueue.main.async { result(false) }
            return
          }
          self.scheduleNotification(center: center, title: title, body: body, result: result)
        }
        return
      }
      guard settings.authorizationStatus == .authorized ||
              settings.authorizationStatus == .provisional else {
        DispatchQueue.main.async { result(false) }
        return
      }
      self.scheduleNotification(center: center, title: title, body: body, result: result)
    }
  }

  private func scheduleNotification(
    center: UNUserNotificationCenter,
    title: String,
    body: String,
    result: @escaping FlutterResult
  ) {
    let content = UNMutableNotificationContent()
    content.title = title
    content.body = body
    content.sound = .default
    let request = UNNotificationRequest(
      identifier: UUID().uuidString,
      content: content,
      trigger: nil
    )
    center.add(request) { error in
      DispatchQueue.main.async { result(error == nil) }
    }
  }

  private func temporaryURL(extension pathExtension: String, prefix: String) -> URL {
    FileManager.default.temporaryDirectory
      .appendingPathComponent("webcord-\(prefix)-\(UUID().uuidString)")
      .appendingPathExtension(pathExtension)
  }

  private func topViewController() -> UIViewController? {
    let window = UIApplication.shared.connectedScenes
      .compactMap { $0 as? UIWindowScene }
      .flatMap(\.windows)
      .first { $0.isKeyWindow }
    var controller = window?.rootViewController
    while let presented = controller?.presentedViewController {
      controller = presented
    }
    return controller
  }
}
