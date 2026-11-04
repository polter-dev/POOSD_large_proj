import 'dart:convert';

import 'package:image_picker/image_picker.dart';

enum PhotoFrom { camera, gallery }

/// A meal photo ready for POST /photo-analyses: plain base64 (no data: prefix) and its media type.
class MealPhoto {
  const MealPhoto({required this.base64, required this.mediaType});

  final String base64;
  final String mediaType; // image/jpeg, image/png or image/webp

  /// From the file's first bytes, since a picked file's name or reported type can't be trusted. Null for a
  /// format the API doesn't take (HEIC, GIF, ...).
  static MealPhoto? fromBytes(List<int> bytes) {
    bool starts(List<int> sig, [int at = 0]) =>
        bytes.length >= at + sig.length &&
        [for (var i = 0; i < sig.length; i++) bytes[at + i] == sig[i]].every((b) => b);
    final mediaType = starts([0xFF, 0xD8, 0xFF])
        ? 'image/jpeg'
        : starts([0x89, 0x50, 0x4E, 0x47])
        ? 'image/png'
        : starts([0x52, 0x49, 0x46, 0x46]) && starts([0x57, 0x45, 0x42, 0x50], 8)
        ? 'image/webp'
        : null;
    return mediaType == null ? null : MealPhoto(base64: base64Encode(bytes), mediaType: mediaType);
  }
}

/// Where a meal photo comes from. Read only when the user asks; the photo is sent once and never stored
/// (contract, Photo analysis). Widget tests pass a fake through ApiScope.
abstract class PhotoSource {
  /// The picked photo's bytes, or null when the user backed out.
  Future<List<int>?> pick(PhotoFrom from);
}

class DevicePhotos implements PhotoSource {
  const DevicePhotos();

  @override
  Future<List<int>?> pick(PhotoFrom from) async {
    // 1024 px and quality 80 (#119): a few hundred kB, far under the API's 3,000,000 base64 characters.
    final file = await ImagePicker().pickImage(
      source: from == PhotoFrom.camera ? ImageSource.camera : ImageSource.gallery,
      maxWidth: 1024,
      maxHeight: 1024,
      imageQuality: 80,
    );
    return file?.readAsBytes();
  }
}
