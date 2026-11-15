#include "FabricatorProjectReader.hpp"
#include <QDir>
#include <QHash>
#include <QMap>
#include <QJsonArray>
#include <QRegularExpression>
#include <QSet>
#include <QUrl>
#include <cmath>
#include <stdexcept>

namespace nymi {
namespace {
QString asId(const QJsonObject& o) { return o.value("id").toString(); }
double finiteNumber(const QJsonObject& o, const char* name) {
    const auto v = o.value(QLatin1String(name));
    if (!v.isDouble() || !std::isfinite(v.toDouble())) throw std::runtime_error("Coordenada de peça não numérica.");
    return v.toDouble();
}
FabricatorModel makeModel(const NativeBundle& bundle,
                          const QJsonObject& document,
                          const QHash<QString, QString>& imageByRelativePath) {
    const double slotValue = document.value("slot").toDouble(-1);
    if (std::floor(slotValue) != slotValue || slotValue < 1 || slotValue > 10)
        throw std::runtime_error("Slot de modelo inválido.");
    FabricatorModel model;
    model.slot = int(slotValue);
    model.name = document.value("name").toString();
    model.sourceName = document.value("sourceName").toString();
    model.width = finiteNumber(document, "width");
    model.height = finiteNumber(document, "height");
    model.document = document;
    if (!(model.width > 0 && model.height > 0 && model.width <= 16384 && model.height <= 16384)
        || !document.value("parts").isArray() || !document.value("joints").isArray())
        throw std::runtime_error("Projeto sem dimensões, peças ou juntas válidas.");
    const auto parts = document.value("parts").toArray();
    if (parts.size() > 500) throw std::runtime_error("Projeto possui peças demais.");
    QHash<QString, FabricatorPart> byId;
    QStringList order;
    const QSet<QString> hidden = [&]() {
        QSet<QString> ids;
        for (const auto& v : document.value("hiddenPartIds").toArray()) if (v.isString()) ids.insert(v.toString());
        return ids;
    }();
    for (const auto& item : parts) {
        if (!item.isObject()) throw std::runtime_error("Peça sem documento.");
        const auto part = item.toObject();
        FabricatorPart current;
        current.id = asId(part);
        current.name = part.value("name").toString(current.id);
        if (current.id.isEmpty() || byId.contains(current.id))
            throw std::runtime_error("ID de peça vazio ou duplicado.");
        current.x = finiteNumber(part, "x");
        current.y = finiteNumber(part, "y");
        current.width = finiteNumber(part, "width");
        current.height = finiteNumber(part, "height");
        current.rotation = finiteNumber(part, "rotation");
        if (!(current.width > 0 && current.height > 0))
            throw std::runtime_error("Peça sem dimensões.");
        const auto key = QString("slot-%1/parts/%2.png").arg(model.slot).arg(current.id);
        const auto assetId = imageByRelativePath.value(key);
        if (assetId.isEmpty()) throw std::runtime_error("Peça sem imagem convertida (assets SHA-256).");
        current.imageAssetId = assetId;
        current.imagePath = NativeDataReader::assetPath(bundle, assetId);
        current.hidden = hidden.contains(current.id);
        current.original = part;
        byId.insert(current.id, current);
        order.append(current.id);
    }
    QStringList backToFront;
    for (const auto& v : document.value("layerOrder").toArray()) {
        if (v.isString() && byId.contains(v.toString()) && !backToFront.contains(v.toString()))
            backToFront.append(v.toString());
    }
    for (const auto& id : order) if (!backToFront.contains(id)) backToFront.append(id);
    for (const auto& id : backToFront) model.parts.append(byId.value(id));
    return model;
}
} // namespace

FabricatorScan FabricatorProjectReader::scan(const NativeBundle& bundle) {
    FabricatorScan result;
    QHash<QString, QString> imageByRelativePath;
    QMap<int, QJsonObject> projects;
    const QRegularExpression projectPattern("^slot-([1-9]|10)/project\\.json$");
    const auto files = bundle.domain("fabricator").value("files").toArray();
    for (const auto& value : files) {
        if (!value.isObject()) continue;
        const auto file = value.toObject();
        const auto relative = file.value("relativePath").toString();
        const auto asset = file.value("asset").toObject().value("$asset").toString();
        if (!asset.isEmpty()) {
            if (!bundle.assets.contains(asset)) {
                result.issues.append("Imagem referenciada fora do índice de assets nativos.");
                continue;
            }
            if (imageByRelativePath.contains(relative) && imageByRelativePath.value(relative) != asset)
                result.issues.append("Recurso duplicado no bundle do Fabricador.");
            else imageByRelativePath.insert(relative, asset);
        }
        const auto match = projectPattern.match(relative);
        if (!match.hasMatch()) continue;
        const int slot = match.captured(1).toInt();
        const auto doc = file.value("document");
        if (!doc.isObject()) {
            result.issues.append(QString("Slot %1: documento de modelo inválido.").arg(slot));
            continue;
        }
        if (projects.contains(slot)) result.issues.append(QString("Slot %1: manifesto duplicado.").arg(slot));
        else projects.insert(slot, doc.toObject());
    }
    for (auto it = projects.cbegin(); it != projects.cend(); ++it) {
        try {
            if (it.value().value("slot").toInt(-1) != it.key())
                throw std::runtime_error("Slot incoerente com o nome do arquivo.");
            result.models.append(makeModel(bundle, it.value(), imageByRelativePath));
        } catch (const std::exception& e) {
            result.issues.append(QString("Slot %1: %2").arg(it.key()).arg(QString::fromUtf8(e.what())));
        }
    }
    return result;
}
