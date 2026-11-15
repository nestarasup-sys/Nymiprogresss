#pragma once

#include <QHash>
#include <QJsonObject>
#include <QString>
#include <QStringList>

namespace nymi {
struct NativeAsset {
    QString id;
    QString sha256;
    QString path;
    QString mediaType;
    qint64 byteLength = 0;
};

struct NativeBundle {
    QString root;
    QJsonObject manifest;
    QHash<QString, NativeAsset> assets;
    QJsonObject domain(const QString& name) const;
};

class NativeDataReader final {
public:
    // Only opens nymiprogress.native-data v1; never detects/imports legacy formats.
    // Opening validates metadata, file paths, existence and sizes, without reading gigabytes of video.
    static NativeBundle open(const QString& folder);
    // Streams the requested asset and verifies SHA-256 before trusting its contents.
    static bool verifyAsset(const NativeBundle& bundle, const QString& id, QString* error = nullptr);
    static QString assetPath(const NativeBundle& bundle, const QString& id);
};
} // namespace nymi
