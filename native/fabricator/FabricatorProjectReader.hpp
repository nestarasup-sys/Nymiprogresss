#pragma once
#include "NativeDataReader.hpp"
#include <QJsonObject>
#include <QString>
#include <QVector>

namespace nymi {
struct FabricatorPart {
    QString id, name, imageAssetId, imagePath;
    double x = 0, y = 0, width = 0, height = 0, rotation = 0;
    bool hidden = false;
    QJsonObject original;
};
struct FabricatorModel {
    int slot = 0;
    QString name, sourceName;
    double width = 0, height = 0;
    QVector<FabricatorPart> parts; // Back-to-front as in legacy normalizeLayerOrder
    QJsonObject document;
};
struct FabricatorScan {
    QVector<FabricatorModel> models;
    QStringList issues; // No private document contents are included
};

class FabricatorProjectReader {
public:
    // Reads ONLY typed documents / SHA assets of the already converted v1 bundle.
    // The original Electron project.json and SQLite are never opened.
    static FabricatorScan scan(const NativeBundle& bundle);
};
} // namespace nymi
