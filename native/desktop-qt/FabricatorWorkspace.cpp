#include "FabricatorWorkspace.hpp"
#include <QDir>
#include <QJsonArray>
#include <QJsonDocument>
#include <QJsonObject>
#include <QSaveFile>
#include <QStandardPaths>
#include <QFile>
#include <QUrl>
#include <QSet>
#include <cmath>

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
    gestureBefore_.reset(); selectedPartId_.clear();
    dirty_ = false; zoom_ = 1.0; panX_ = panY_ = 0;
}
QVariantList FabricatorWorkspace::slots() const {
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
        changedState();
    }
}
void FabricatorWorkspace::setPartRotation(const QString& id, double rotation) {
    if (!std::isfinite(rotation) || std::abs(rotation) > 100000) return;
    if (auto* part = mutablePart(id)) {
        if (part->rotation == rotation) return;
        beforeChange();
        part->rotation = rotation; dirty_ = true;
        changedState();
    }
}
void FabricatorWorkspace::setPartVisible(const QString& id, bool visible) {
    if (auto* part = mutablePart(id)) {
        if (part->hidden == !visible) return;
        beforeChange();
        part->hidden = !visible; dirty_ = true;
        changedState();
    }
}
void FabricatorWorkspace::beginGesture() {
    if (working_ && !gestureBefore_) gestureBefore_ = *working_;
}
void FabricatorWorkspace::endGesture() {
    if (working_ && gestureBefore_) {
        if (working_->parts != gestureBefore_->parts) {
            undo_.append(*gestureBefore_);
            if (undo_.size() > 80) undo_.removeFirst();
            redo_.clear();
        }
        gestureBefore_.reset(); changedState();
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
// Draft persistence is added in the final round. The data bundle stays immutable.
QString FabricatorWorkspace::draftPath() const { return {}; }
bool FabricatorWorkspace::saveDraft() { return false; }
bool FabricatorWorkspace::loadDraft() { return false; }
bool FabricatorWorkspace::discardDraft() { return false; }
