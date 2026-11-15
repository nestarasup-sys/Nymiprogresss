#include "NativeDataReader.hpp"
#include <QCoreApplication>
#include <QCryptographicHash>
#include <QDir>
#include <QFile>
#include <QJsonArray>
#include <QJsonDocument>
#include <QJsonObject>
#include <QTemporaryDir>
#include <stdexcept>

static void require(bool ok) { if (!ok) throw std::runtime_error("Teste falhou"); }
static bool write(const QString& path, const QByteArray& bytes) {
    QDir().mkpath(QFileInfo(path).absolutePath());
    QFile f(path);
    return f.open(QIODevice::WriteOnly) && f.write(bytes) == bytes.size();
}
static QJsonObject emptyDomain(const QString& domain) {
    QJsonObject data{{"catalogRecords", QJsonArray{}}, {"preservedUnknown", QJsonArray{}}};
    if (domain == "fabricator" || domain == "customizer")
        data.insert("entities", QJsonArray{}), data.insert("files", QJsonArray{}), data.insert("recoveryHistory", QJsonArray{});
    else if (domain == "baseVideos")
        data.insert("recoveryHistory", QJsonArray{}),
        data.insert("catalog", QJsonObject{{"videos", QJsonArray{}}, {"drafts", QJsonArray{}},
            {"categories", QJsonArray{}}, {"media", QJsonArray{}},
            {"sequence", QJsonObject{{"nextNumber", 1}}}});
    return QJsonObject{{"schemaVersion", 1}, {"data", data}};
}
int main(int argc, char** argv) {
    QCoreApplication app(argc, argv);
    QTemporaryDir temp;
    require(temp.isValid());
    const QByteArray bytes = "fake video data";
    const QString digest = QString::fromLatin1(QCryptographicHash::hash(bytes, QCryptographicHash::Sha256).toHex());
    const QString id = "sha256:" + digest;
    const QString rel = "assets/sha256/" + digest.left(2) + "/" + digest;
    require(write(temp.filePath(rel), bytes));

    QJsonObject domains;
    for (const auto& name : {"fabricator", "customizer", "studio", "roteiros", "baseVideos", "editorV6", "libraries", "preferences"})
        domains.insert(name, emptyDomain(name));
    auto videoData = domains.value("baseVideos").toObject().value("data").toObject();
    auto catalog = videoData.value("catalog").toObject();
    catalog.insert("videos", QJsonArray{QJsonObject{{"id", "video-1"}, {"status", "draft"}, {"categoryIds", QJsonArray{}}}});
    catalog.insert("drafts", QJsonArray{"video-1"});
    catalog.insert("media", QJsonArray{QJsonObject{{"id", "video-1"}, {"sha256", digest}, {"size", bytes.size()},
        {"asset", QJsonObject{{"$asset", id}}}}});
    videoData.insert("catalog", catalog);
    auto baseVideo = domains.value("baseVideos").toObject();
    baseVideo.insert("data", videoData);
    domains.insert("baseVideos", baseVideo);
    QJsonObject manifest{
        {"format", "nymiprogress.native-data"}, {"formatVersion", 1},
        {"provenance", QJsonObject{{"selectedDomains", QJsonArray{"fabricator", "customizer", "baseVideos"}}}},
        {"domains", domains},
        {"assets", QJsonArray{QJsonObject{{"id", id}, {"sha256", digest}, {"byteLength", bytes.size()},
            {"mediaType", "video/mp4"}, {"path", rel}}}},
        {"references", QJsonArray{}}
    };
    const auto manifestPath = temp.filePath("manifest.json");
    require(write(manifestPath, QJsonDocument(manifest).toJson()));
    const auto bundle = nymi::NativeDataReader::open(temp.path());
    require(bundle.assets.size() == 1);
    require(nymi::NativeDataReader::verifyAsset(bundle, id));
    require(bundle.domain("baseVideos").value("catalog").toObject().value("videos").toArray().size() == 1);
    // Corrupt same-sized content: shallow metadata check succeeds, streaming SHA catches it.
    require(write(temp.filePath(rel), "FAKE video data"));
    require(nymi::NativeDataReader::open(temp.path()).assets.size() == 1);
    require(!nymi::NativeDataReader::verifyAsset(bundle, id));
    require(write(temp.filePath(rel), bytes));
    // Old/unknown formats and unresolved asset references are rejected.
    manifest.insert("formatVersion", 2);
    require(write(manifestPath, QJsonDocument(manifest).toJson()));
    bool blocked = false;
    try { (void)nymi::NativeDataReader::open(temp.path()); } catch (...) { blocked = true; }
    require(blocked);
    manifest.insert("formatVersion", 1);
    auto corrupted = manifest.value("domains").toObject();
    auto cb = corrupted.value("baseVideos").toObject();
    auto data = cb.value("data").toObject();
    auto cat = data.value("catalog").toObject();
    auto media = cat.value("media").toArray();
    auto mediaObject = media.at(0).toObject();
    mediaObject.insert("asset", QJsonObject{{"$asset", "sha256:unmapped"}});
    media.replace(0, mediaObject);
    cat.insert("media", media);
    data.insert("catalog", cat);
    cb.insert("data", data);
    corrupted.insert("baseVideos", cb);
    manifest.insert("domains", corrupted);
    require(write(manifestPath, QJsonDocument(manifest).toJson()));
    blocked = false;
    try { (void)nymi::NativeDataReader::open(temp.path()); } catch (...) { blocked = true; }
    require(blocked);
}
