#pragma once

#include "NativeDataReader.hpp"
#include "FabricatorWorkspace.hpp"

#include <QFutureWatcher>
#include <QObject>
#include <QUrl>
#include <QVariantList>
#include <optional>

struct VideoCheck {
    QString id;
    QString path;
    QString error;
};

class AppBridge : public QObject {
    Q_OBJECT
    Q_PROPERTY(FabricatorWorkspace* fabricator READ fabricator CONSTANT)
    Q_PROPERTY(bool loaded READ loaded NOTIFY dataChanged)
    Q_PROPERTY(QString status READ status NOTIFY dataChanged)
    Q_PROPERTY(QString bundleFolder READ bundleFolder NOTIFY dataChanged)
    Q_PROPERTY(QVariantList fabricatorItems READ fabricatorItems NOTIFY dataChanged)
    Q_PROPERTY(QVariantList characterItems READ characterItems NOTIFY dataChanged)
    Q_PROPERTY(QVariantList videoItems READ videoItems NOTIFY dataChanged)
    Q_PROPERTY(int draftCount READ draftCount NOTIFY dataChanged)
    Q_PROPERTY(QUrl videoSource READ videoSource NOTIFY videoSourceChanged)
    Q_PROPERTY(QString videoVerification READ videoVerification NOTIFY videoVerificationChanged)

public:
    explicit AppBridge(QObject* parent = nullptr);
    Q_INVOKABLE void loadBundle(const QString& directory);
    Q_INVOKABLE void verifyAndOpenVideo(const QString& videoId);
    Q_INVOKABLE void clearVideo();
    Q_INVOKABLE double sampleNormalizedPosition(double seconds) const;
    FabricatorWorkspace* fabricator() { return &fabricator_; }
    bool loaded() const { return bundle_.has_value(); }
    QString status() const { return status_; }
    QString bundleFolder() const { return bundle_ ? bundle_->root : QString{}; }
    QVariantList fabricatorItems() const { return fabricator_; }
    QVariantList characterItems() const { return characters_; }
    QVariantList videoItems() const { return videos_; }
    int draftCount() const { return drafts_; }
    QUrl videoSource() const { return videoSource_; }
    QString videoVerification() const { return videoVerification_; }

signals:
    void dataChanged();
    void videoSourceChanged();
    void videoVerificationChanged();

private:
    void projectData();
    std::optional<nymi::NativeBundle> bundle_;
    FabricatorWorkspace fabricator_;
    QVariantList fabricator_;
    QVariantList characters_;
    QVariantList videos_;
    QHash<QString, QString> videoAssets_;
    int drafts_ = 0;
    QString status_ = "Selecione a pasta do bundle nativo v1. Seus dados não serão modificados.";
    QUrl videoSource_;
    QString videoVerification_;
    QFutureWatcher<VideoCheck> videoCheck_;
};
