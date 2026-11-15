#include "FabricatorWorkspace.hpp"
#include <QDir>
#include <QFileInfo>
#include <QCryptographicHash>
#include <QDateTime>
#include <QJsonParseError>
#include <QJsonArray>
#include <QJsonDocument>
#include <QJsonObject>
#include <QSaveFile>
#include <QStandardPaths>
#include <QFile>
#include <QUrl>
#include <QSet>
#include <cmath>
#include <algorithm>

FabricatorWorkspace::FabricatorWorkspace(QObject* parent) : QObject(parent) {}
void FabricatorWorkspace::changedState() { emit changed(); }
void FabricatorWorkspace::setBundle(const nymi::NativeBundle& bundle) {
    const auto scan = nymi::FabricatorProjectReader::scan(bundle);
    models_ = scan.models;
    error_ = scan.issues.join("; ");
    selectedSlot_ = 1;
    clearEditState();
    selectSlot(1);
}
void FabricatorWorkspace::clearEditState() {
    working_.reset(); original_.reset(); undo_.clear(); redo_.clear();
    gestureBefore_.reset(); gestureChanged_ = false; selectedPartId_.clear();
    dirty_ = false; zoom_ = 1.0; panX_ = panY_ = 0;
}
QVariantList FabricatorWorkspace::modelSlots() const {
    QVariantList result;
    for (int slot = 1; slot <= 10; ++slot) {
        QVariantMap item{{"slot", slot}, {"name", QString("Vazio")}, {"filled", false}, {"partCount", 0}};
        for (const auto& model : models_) if (model.slot == slot) {
            item["name"] = model.name.isEmpty() ? QString("Modelo %1").arg(slot) : model.name;
            item["filled"] = true;
            item["partCount"] = model.parts.size();
            break;
        }
        result.append(item);
    }
    return result;
}
void FabricatorWorkspace::selectSlot(int slot) {
    if (slot < 1 || slot > 10) return;
    selectedSlot_ = slot;
    clearEditState();
    for (const auto& model : models_) if (model.slot == slot) {
        original_ = model; working_ = model;
        break;
    }
    changedState();
}
QVariantMap FabricatorWorkspace::modelInfo() const {
    if (!working_) return {};
    return {{"slot", working_->slot}, {"name", working_->name},
        {"width", working_->width}, {"height", working_->height},
        {"partCount", working_->parts.size()},
        {"jointCount", working_->document.value("joints").toArray().size()}};
}
QVariantMap FabricatorWorkspace::mapPart(const nymi::FabricatorPart& p) const {
    return {{"id", p.id}, {"name", p.name},
        {"x", p.x}, {"y", p.y}, {"width", p.width}, {"height", p.height},
        {"rotation", p.rotation}, {"hidden", p.hidden},
        {"imageUrl", QUrl::fromLocalFile(p.imagePath).toString()},
        {"selected", selectedPartId_ == p.id}};
}
QVariantList FabricatorWorkspace::parts() const {
    QVariantList result;
    if (working_) for (const auto& p : working_->parts) result.append(mapPart(p));
    return result;
}
QVariantList FabricatorWorkspace::joints() const {
    QVariantList result;
    if (working_) for (const auto& v : working_->document.value("joints").toArray())
        if (v.isObject()) result.append(v.toObject().toVariantMap());
    return result;
}
QVariantMap FabricatorWorkspace::selectedPart() const {
    if (working_) for (const auto& p : working_->parts)
        if (p.id == selectedPartId_) return mapPart(p);
    return {};
}
void FabricatorWorkspace::selectPart(const QString& id) {
    if (!working_) return;
    if (!id.isEmpty()) {
        bool found = false;
        for (const auto& p : working_->parts) if (p.id == id) { found = true; break; }
        if (!found) return;
    }
    selectedPartId_ = id;
    changedState();
}
void FabricatorWorkspace::setZoom(double factor) {
    if (!std::isfinite(factor)) return;
    zoom_ = std::clamp(factor, 0.1, 4.0);
    changedState();
}
void FabricatorWorkspace::setPan(double x, double y) {
    if (!std::isfinite(x) || !std::isfinite(y)) return;
    panX_ = x; panY_ = y;
    changedState();
}
void FabricatorWorkspace::centerView() {
    zoom_ = 1.0; panX_ = panY_ = 0.0; changedState();
}
nymi::FabricatorPart* FabricatorWorkspace::mutablePart(const QString& id) {
    if (working_) for (auto& part : working_->parts) if (part.id == id) return &part;
    return nullptr;
}
void FabricatorWorkspace::beforeChange() {
    if (!working_) return;
    if (!gestureBefore_) {
        undo_.append(*working_);
        if (undo_.size() > 80) undo_.removeFirst();
        redo_.clear();
    }
}
void FabricatorWorkspace::setPartPosition(const QString& id, double x, double y) {
    if (!std::isfinite(x) || !std::isfinite(y) || std::abs(x) > 100000 || std::abs(y) > 100000) return;
    if (auto* part = mutablePart(id)) {
        if (part->x == x && part->y == y) return;
        beforeChange();
        part->x = x; part->y = y; dirty_ = true;
        if (gestureBefore_) gestureChanged_ = true;
        changedState();
    }
}
void FabricatorWorkspace::setPartRotation(const QString& id, double rotation) {
    if (!std::isfinite(rotation) || std::abs(rotation) > 100000) return;
    if (auto* part = mutablePart(id)) {
        if (part->rotation == rotation) return;
        beforeChange();
        part->rotation = rotation; dirty_ = true;
        if (gestureBefore_) gestureChanged_ = true;
        changedState();
    }
}
void FabricatorWorkspace::setPartVisible(const QString& id, bool visible) {
    if (auto* part = mutablePart(id)) {
        if (part->hidden == !visible) return;
        beforeChange();
        part->hidden = !visible; dirty_ = true;
        if (gestureBefore_) gestureChanged_ = true;
        changedState();
    }
}
void FabricatorWorkspace::beginGesture() {
    if (working_ && !gestureBefore_) { gestureBefore_ = *working_; gestureChanged_ = false; }
}
void FabricatorWorkspace::endGesture() {
    if (working_ && gestureBefore_) {
        if (gestureChanged_) {
            undo_.append(*gestureBefore_);
            if (undo_.size() > 80) undo_.removeFirst();
            redo_.clear();
        }
        gestureBefore_.reset(); gestureChanged_ = false; changedState();
    }
}
void FabricatorWorkspace::undo() {
    if (!working_ || undo_.isEmpty()) return;
    redo_.append(*working_);
    working_ = undo_.takeLast();
    dirty_ = true;
    changedState();
}
void FabricatorWorkspace::redo() {
    if (!working_ || redo_.isEmpty()) return;
    undo_.append(*working_);
    working_ = redo_.takeLast();
    dirty_ = true;
    changedState();
}
void FabricatorWorkspace::resetWorking() {
    if (!original_) return;
    working_ = original_;
    undo_.clear(); redo_.clear(); gestureBefore_.reset();
    dirty_ = false;
    changedState();
}
QString FabricatorWorkspace::draftPath() const {
    if (!original_) return {};
    const auto base = QStandardPaths::writableLocation(QStandardPaths::AppLocalDataLocation);
    if (base.isEmpty()) return {};
    return QDir(base).filePath(QString("fabricator-drafts/slot-%1.json").arg(original_->slot));
}
namespace {
QString sourceFingerprint(const nymi::FabricatorModel& model) {
    return QString::fromLatin1(QCryptographicHash::hash(
        QJsonDocument(model.document).toJson(QJsonDocument::Compact),
        QCryptographicHash::Sha256).toHex());
}
}
bool FabricatorWorkspace::saveDraft() {
    if (!working_ || !original_) { error_ = "Nenhum modelo ativo para salvar."; changedState(); return false; }
    const auto destination = draftPath();
    if (destination.isEmpty() || !QDir().mkpath(QFileInfo(destination).absolutePath())) {
        error_ = "Não foi possível criar a pasta privada do rascunho."; changedState(); return false;
    }
    QJsonArray changes;
    for (const auto& part : working_->parts) {
        changes.append(QJsonObject{{"id", part.id}, {"x", part.x}, {"y", part.y},
            {"rotation", part.rotation}, {"hidden", part.hidden}});
    }
    QJsonObject record{
        {"format", "nymiprogress.fabricator-draft"}, {"version", 1},
        {"slot", original_->slot}, {"sourceModelSha256", sourceFingerprint(*original_)},
        {"createdAt", QDateTime::currentDateTimeUtc().toString(Qt::ISODateWithMs)},
        {"transforms", changes}
    };
    QSaveFile output(destination);
    if (!output.open(QIODevice::WriteOnly)) { error_ = "Erro ao abrir rascunho privado."; changedState(); return false; }
    const auto bytes = QJsonDocument(record).toJson(QJsonDocument::Indented);
    if (output.write(bytes) != bytes.size() || !output.commit()) {
        error_ = "Falha ao gravar rascunho privado."; changedState(); return false;
    }
    error_ = "Rascunho salvo localmente. O bundle v1 continua intacto.";
    dirty_ = false;
    changedState();
    return true;
}
bool FabricatorWorkspace::loadDraft() {
    if (!original_ || !working_) return false;
    QFile input(draftPath());
    if (!input.open(QIODevice::ReadOnly)) { error_ = "Rascunho local inexistente."; changedState(); return false; }
    if (input.size() > 2 * 1024 * 1024) { error_ = "Rascunho grande demais."; changedState(); return false; }
    QJsonParseError parse;
    const auto json = QJsonDocument::fromJson(input.readAll(), &parse);
    if (parse.error != QJsonParseError::NoError || !json.isObject()) {
        error_ = "JSON do rascunho inválido."; changedState(); return false;
    }
    const auto data = json.object();
    if (data.value("format").toString() != "nymiprogress.fabricator-draft" ||
        data.value("version").toInt(-1) != 1 || data.value("slot").toInt(-1) != original_->slot ||
        data.value("sourceModelSha256").toString() != sourceFingerprint(*original_) ||
        !data.value("transforms").isArray()) {
        error_ = "Rascunho não pertence à versão atual deste modelo."; changedState(); return false;
    }
    auto next = *original_;
    const auto changes = data.value("transforms").toArray();
    if (changes.size() != next.parts.size()) {
        error_ = "Rascunho incompleto: contagem de peças diferente."; changedState(); return false;
    }
    QHash<QString, QJsonObject> byId;
    for (const auto& item : changes) {
        if (!item.isObject()) { error_ = "Transformação inválida."; changedState(); return false; }
        const auto change = item.toObject();
        const auto id = change.value("id").toString();
        if (id.isEmpty() || byId.contains(id)) { error_ = "ID duplicado no rascunho."; changedState(); return false; }
        byId.insert(id, change);
    }
    for (auto& part : next.parts) {
        const auto change = byId.value(part.id);
        if (change.isEmpty() || !change.value("hidden").isBool()) {
            error_ = "Rascunho contém peça ausente."; changedState(); return false;
        }
        for (const char* key : {"x", "y", "rotation"}) {
            const auto value = change.value(QLatin1String(key));
            if (!value.isDouble() || !std::isfinite(value.toDouble()) || std::abs(value.toDouble()) > 100000) {
                error_ = "Coordenada inválida no rascunho."; changedState(); return false;
            }
        }
        part.x = change.value("x").toDouble();
        part.y = change.value("y").toDouble();
        part.rotation = change.value("rotation").toDouble();
        part.hidden = change.value("hidden").toBool();
    }
    undo_.append(*working_); if (undo_.size() > 80) undo_.removeFirst();
    redo_.clear();
    working_ = std::move(next);
    dirty_ = false;
    error_ = "Rascunho local carregado; bundle original preservado.";
    changedState();
    return true;
}
bool FabricatorWorkspace::discardDraft() {
    const auto path = draftPath();
    if (path.isEmpty() || !QFileInfo::exists(path) || !QFile::remove(path)) {
        error_ = "Não havia rascunho local para excluir."; changedState(); return false;
    }
    error_ = "Rascunho local excluído. O bundle original não foi tocado.";
    changedState();
    return true;
}
