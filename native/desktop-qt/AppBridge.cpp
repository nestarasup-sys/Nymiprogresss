#include "AppBridge.hpp"
#include "nymi/Timeline.hpp"

#include <QJsonArray>
#include <QJsonObject>
#include <QVariantMap>
#include <QtConcurrent>
#include <QUrl>

namespace {
QString labelFor(const QJsonObject& document, const QString& fallback) {
    for (const char* key : {"displayName", "name", "title", "nickname", "label"}) {
        const auto value = document.value(QLatin1String(key));
        if (value.isString() && !value.toString().trimmed().isEmpty()) return value.toString().trimmed();
    }
    return fallback;
}
QVariantMap row(const QString& id, const QString& title, const QString& subtitle, const QString& kind) {
    return {{"id", id}, {"title", title}, {"subtitle", subtitle}, {"kind", kind}};
}
}

AppBridge::AppBridge(QObject* parent) : QObject(parent) {
    connect(&videoCheck_, &QFutureWatcher<VideoCheck>::finished, this, [this]() {
        const auto checked = videoCheck_.result();
        if (!checked.error.isEmpty()) {
            videoVerification_ = "Falha na verificação: " + checked.error;
        } else {
            videoVerification_ = "SHA-256 verificado. Mídia pronta para reprodução.";
            videoSource_ = QUrl::fromLocalFile(checked.path);
            emit videoSourceChanged();
        }
        emit videoVerificationChanged();
    });
}

void AppBridge::loadBundle(const QString& directory) {
    if (videoCheck_.isRunning()) {
        status_ = "Aguarde a verificação de vídeo antes de trocar o bundle.";
        emit dataChanged();
        return;
    }
    try {
        auto next = nymi::NativeDataReader::open(directory);
        bundle_ = std::move(next);
        clearVideo();
        projectData();
        status_ = QString("Bundle nativo v1 carregado: %1 personagens, %2 vídeos (%3 rascunhos).")
            .arg(characters_.size()).arg(videos_.size()).arg(drafts_);
    } catch (const std::exception& e) {
        status_ = "Não foi possível abrir: " + QString::fromUtf8(e.what());
    }
    emit dataChanged();
}

void AppBridge::projectData() {
    fabricator_.clear();
    characters_.clear();
    videos_.clear();
    videoAssets_.clear();
    drafts_ = 0;
    if (!bundle_) return;
    const auto fabricator = bundle_->domain("fabricator");
    for (const auto& value : fabricator.value("entities").toArray()) {
        const auto entity = value.toObject();
        const auto id = entity.value("id").toString();
        fabricator_.append(row(id, labelFor(entity.value("document").toObject(), id), "Entidade de fabricação", "entity"));
    }
    for (const auto& value : fabricator.value("files").toArray()) {
        const auto file = value.toObject();
        const auto path = file.value("relativePath").toString();
        const auto kind = file.value("kind").toString("resource");
        fabricator_.append(row(path, path, kind, "resource"));
    }
    for (const auto& value : bundle_->domain("customizer").value("entities").toArray()) {
        const auto entity = value.toObject();
        const auto id = entity.value("id").toString();
        characters_.append(row(id, labelFor(entity.value("document").toObject(), id),
                               "Personagem • ID: " + id, "character"));
    }
    const auto catalog = bundle_->domain("baseVideos").value("catalog").toObject();
    QHash<QString, QJsonObject> mediaById;
    for (const auto& value : catalog.value("media").toArray()) {
        const auto media = value.toObject();
        mediaById.insert(media.value("id").toString(), media);
    }
    for (const auto& value : catalog.value("videos").toArray()) {
        const auto video = value.toObject();
        const auto id = video.value("id").toString();
        const auto media = mediaById.value(id);
        const bool isDraft = video.value("status").toString() == "draft";
        if (isDraft) ++drafts_;
        auto title = media.value("name").toString();
        if (title.isEmpty()) title = (isDraft ? "Rascunho " : "Vídeo ") + id.left(8);
        auto item = row(id, title, isDraft ? "Rascunho" : "Publicado", "video");
        item.insert("description", video.value("description").toString());
        item.insert("status", video.value("status").toString());
        item.insert("size", media.value("size").toDouble());
        item.insert("categoryCount", video.value("categoryIds").toArray().size());
        videos_.append(item);
        videoAssets_.insert(id, media.value("asset").toObject().value("$asset").toString());
    }
}

void AppBridge::clearVideo() {
    if (!videoSource_.isEmpty()) {
        videoSource_ = QUrl();
        emit videoSourceChanged();
    }
    videoVerification_.clear();
    emit videoVerificationChanged();
}

void AppBridge::verifyAndOpenVideo(const QString& videoId) {
    if (!bundle_ || videoCheck_.isRunning()) return;
    clearVideo();
    const auto id = videoAssets_.value(videoId);
    if (id.isEmpty()) {
        videoVerification_ = "Vídeo não consta no catálogo nativo.";
        emit videoVerificationChanged();
        return;
    }
    videoVerification_ = "Verificando a integridade SHA-256 em segundo plano...";
    emit videoVerificationChanged();
    const auto snapshot = *bundle_;
    videoCheck_.setFuture(QtConcurrent::run([snapshot, id]() -> VideoCheck {
        VideoCheck result;
        result.id = id;
        if (!nymi::NativeDataReader::verifyAsset(snapshot, id, &result.error)) return result;
        try { result.path = nymi::NativeDataReader::assetPath(snapshot, id); }
        catch (const std::exception& error) { result.error = QString::fromUtf8(error.what()); }
        return result;
    }));
}

double AppBridge::sampleNormalizedPosition(double seconds) const {
    const std::vector<nymi::Keyframe> keys{{0, 0.0}, {1, 0.15}, {2, 0.72}, {3, 1.0}};
    return nymi::evaluateTrack(keys, seconds);
}
