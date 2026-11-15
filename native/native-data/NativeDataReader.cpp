#include "NativeDataReader.hpp"

#include <QCryptographicHash>
#include <QDir>
#include <QFile>
#include <QFileInfo>
#include <QJsonArray>
#include <QJsonDocument>
#include <QJsonParseError>
#include <QSet>
#include <cmath>
#include <stdexcept>

namespace nymi {
namespace {
[[noreturn]] void fail(const QString& message) { throw std::runtime_error(message.toStdString()); }
bool isRecord(const QJsonValue& value) { return value.isObject(); }
const QStringList domainNames = { "fabricator", "customizer", "studio", "roteiros",
                                  "baseVideos", "editorV6", "libraries", "preferences" };
const QStringList selectedNames = { "fabricator", "customizer", "baseVideos" };

QJsonObject checkedObject(const QJsonValue& value, const QString& label) {
    if (!value.isObject()) fail(label + " deve ser um objeto.");
    return value.toObject();
}
QJsonArray checkedArray(const QJsonObject& value, const QString& key, const QString& label) {
    if (!value.value(key).isArray()) fail(label + "." + key + " deve ser uma lista.");
    return value.value(key).toArray();
}
QString checkedString(const QJsonObject& value, const QString& key, const QString& label) {
    const auto item = value.value(key);
    if (!item.isString() || item.toString().isEmpty()) fail(label + "." + key + " inválido.");
    return item.toString();
}
qint64 checkedLength(const QJsonObject& value, const QString& key, const QString& label) {
    const double number = value.value(key).toDouble(-1);
    if (!std::isfinite(number) || number < 0 || number > 9007199254740991.0 || std::floor(number) != number)
        fail(label + "." + key + " inválido.");
    return static_cast<qint64>(number);
}
void checkAssetRefs(const QJsonValue& value, const QHash<QString, NativeAsset>& assets) {
    if (value.isArray()) {
        for (const auto& item : value.toArray()) checkAssetRefs(item, assets);
    } else if (value.isObject()) {
        const auto object = value.toObject();
        if (object.contains("$asset")) {
            const auto id = object.value("$asset");
            if (!id.isString() || !assets.contains(id.toString())) fail("Referência $asset ausente no manifesto.");
        }
        for (auto it = object.begin(); it != object.end(); ++it) {
            if (it.key().contains("editor-v7", Qt::CaseInsensitive) || it.key().contains("editorV7", Qt::CaseInsensitive))
                fail("Editor experimental não pertence ao formato nativo.");
            checkAssetRefs(it.value(), assets);
        }
    }
}
void checkEntities(const QJsonObject& data, const QString& domain) {
    QSet<QString> ids;
    for (const auto& value : checkedArray(data, "entities", domain)) {
        const auto entity = checkedObject(value, domain + ".entity");
        const auto id = checkedString(entity, "id", domain + ".entity");
        if (ids.contains(id) || id.size() > 200) fail("ID duplicado ou inválido em " + domain);
        ids.insert(id);
        if (!entity.value("document").isObject() && !entity.value("document").isArray())
            fail("Entidade sem documento nativo em " + domain);
    }
    checkedArray(data, "files", domain);
    checkedArray(data, "recoveryHistory", domain);
}
void checkBaseVideos(const QJsonObject& data) {
    const auto catalog = checkedObject(data.value("catalog"), "baseVideos.catalog");
    const auto videos = checkedArray(catalog, "videos", "baseVideos.catalog");
    const auto drafts = checkedArray(catalog, "drafts", "baseVideos.catalog");
    const auto media = checkedArray(catalog, "media", "baseVideos.catalog");
    const auto categories = checkedArray(catalog, "categories", "baseVideos.catalog");
    const auto sequence = checkedObject(catalog.value("sequence"), "baseVideos.sequence");
    if (checkedLength(sequence, "nextNumber", "baseVideos.sequence") < 1) fail("Sequência inválida.");
    QSet<QString> videoIds, draftIds, mediaIds, categoryIds;
    for (const auto& value : videos) {
        const auto video = checkedObject(value, "baseVideos.video");
        const auto id = checkedString(video, "id", "baseVideos.video");
        const auto status = checkedString(video, "status", "baseVideos.video");
        if (videoIds.contains(id) || (status != "draft" && status != "published")) fail("Vídeo duplicado ou status inválido.");
        videoIds.insert(id);
    }
    for (const auto& value : categories) {
        const auto category = checkedObject(value, "baseVideos.category");
        const auto id = checkedString(category, "id", "baseVideos.category");
        if (categoryIds.contains(id)) fail("Categoria repetida.");
        categoryIds.insert(id);
    }
    for (const auto& value : videos) {
        const auto video = value.toObject();
        const auto categories = checkedArray(video, "categoryIds", "baseVideos.video");
        for (const auto& category : categories) if (!category.isString() || !categoryIds.contains(category.toString()))
            fail("Categoria de vídeo ausente.");
    }
    for (const auto& value : drafts) {
        if (!value.isString() || draftIds.contains(value.toString()) || !videoIds.contains(value.toString()))
            fail("Rascunho inválido.");
        draftIds.insert(value.toString());
    }
    for (const auto& value : videos) {
        const auto video = value.toObject();
        if ((video.value("status").toString() == "draft") != draftIds.contains(video.value("id").toString()))
            fail("Status de rascunho inconsistente.");
    }
    for (const auto& value : media) {
        const auto entry = checkedObject(value, "baseVideos.media");
        const auto id = checkedString(entry, "id", "baseVideos.media");
        if (!videoIds.contains(id) || mediaIds.contains(id)) fail("Mídia sem vídeo ou duplicada.");
        mediaIds.insert(id);
        const auto asset = checkedObject(entry.value("asset"), "baseVideos.media.asset");
        if (!asset.value("$asset").isString()) fail("Mídia sem $asset.");
        const auto digest = checkedString(entry, "sha256", "baseVideos.media");
        if (asset.value("$asset").toString() != "sha256:" + digest) fail("Hash de mídia inconsistente.");
        if (checkedLength(entry, "size", "baseVideos.media") < 1) fail("Mídia vazia.");
    }
    if (mediaIds != videoIds) fail("Vídeos sem mídia correspondente.");
}
bool inside(const QString& root, const QString& filePath) {
    const auto relative = QDir(root).relativeFilePath(filePath);
    return relative != ".." && !relative.startsWith("../") && !QDir::isAbsolutePath(relative);
}
QString safeFile(const NativeBundle& bundle, const NativeAsset& asset) {
    const auto absolute = QDir(bundle.root).absoluteFilePath(asset.path);
    const QFileInfo file(absolute);
    if (!file.exists() || !file.isFile() || file.isSymLink() || file.size() != asset.byteLength)
        fail("Arquivo de asset ausente, alterado ou ligado por symlink: " + asset.id);
    const auto canonical = file.canonicalFilePath();
    if (canonical.isEmpty() || !inside(bundle.root, canonical)) fail("Asset fora do bundle.");
    return canonical;
}
} // namespace

QJsonObject NativeBundle::domain(const QString& name) const {
    return manifest.value("domains").toObject().value(name).toObject().value("data").toObject();
}

NativeBundle NativeDataReader::open(const QString& folder) {
    const QFileInfo rootInfo(folder);
    if (!rootInfo.isDir() || rootInfo.isSymLink()) fail("Pasta do bundle nativo não encontrada ou é symlink.");
    NativeBundle bundle;
    bundle.root = QDir(folder).canonicalPath();
    if (bundle.root.isEmpty()) fail("Pasta do bundle não pôde ser resolvida.");
    const QFileInfo manifestInfo(QDir(bundle.root).filePath("manifest.json"));
    if (!manifestInfo.isFile() || manifestInfo.isSymLink() || manifestInfo.size() > 512LL * 1024 * 1024)
        fail("manifest.json ausente, inválido ou grande demais.");
    QFile file(manifestInfo.absoluteFilePath());
    if (!file.open(QIODevice::ReadOnly)) fail("Não foi possível ler manifest.json.");
    QJsonParseError parse;
    const auto document = QJsonDocument::fromJson(file.readAll(), &parse);
    if (parse.error != QJsonParseError::NoError || !document.isObject()) fail("JSON inválido no manifest.json.");
    bundle.manifest = document.object();
    if (bundle.manifest.value("format").toString() != "nymiprogress.native-data"
        || bundle.manifest.value("formatVersion").toInt(-1) != 1) fail("Formato nativo não suportado (esperado v1).");
    const auto provenance = checkedObject(bundle.manifest.value("provenance"), "provenance");
    const auto chosen = checkedArray(provenance, "selectedDomains", "provenance");
    QSet<QString> selected;
    for (const auto& value : chosen) {
        if (!value.isString()) fail("Domínio selecionado inválido.");
        selected.insert(value.toString());
    }
    QSet<QString> expectedSelection;
    for (const auto& name : selectedNames) expectedSelection.insert(name);
    if (chosen.size() != 3 || selected != expectedSelection)
        fail("A seleção de dados não corresponde à migração acordada.");
    const auto domains = checkedObject(bundle.manifest.value("domains"), "domains");
    if (domains.size() != domainNames.size()) fail("Quantidade de domínios nativos incorreta.");
    for (const auto& name : domainNames) {
        const auto domain = checkedObject(domains.value(name), name);
        if (domain.value("schemaVersion").toInt(-1) != 1) fail("Versão do domínio inválida: " + name);
        const auto data = checkedObject(domain.value("data"), name + ".data");
        if (!selected.contains(name) && !data.value("entities").toArray().isEmpty())
            fail("Entidades de domínio fora do escopo.");
        if (!checkedArray(data, "catalogRecords", name).isEmpty()
            || !checkedArray(data, "preservedUnknown", name).isEmpty()) fail("Dados opacos não são formato nativo.");
        if (name == "fabricator" || name == "customizer") checkEntities(data, name);
        if (name == "baseVideos") checkBaseVideos(data);
    }
    const auto assets = checkedArray(bundle.manifest, "assets", "manifest");
    for (const auto& value : assets) {
        const auto item = checkedObject(value, "asset");
        NativeAsset asset;
        asset.sha256 = checkedString(item, "sha256", "asset");
        if (asset.sha256.size() != 64) fail("Hash SHA-256 inválido.");
        for (const auto ch : asset.sha256) if (!((ch >= '0' && ch <= '9') || (ch >= 'a' && ch <= 'f'))) fail("Hash SHA-256 inválido.");
        asset.id = checkedString(item, "id", "asset");
        asset.mediaType = checkedString(item, "mediaType", "asset");
        asset.byteLength = checkedLength(item, "byteLength", "asset");
        asset.path = checkedString(item, "path", "asset");
        const auto expectedPath = "assets/sha256/" + asset.sha256.left(2) + "/" + asset.sha256;
        if (asset.id != "sha256:" + asset.sha256 || asset.path != expectedPath || bundle.assets.contains(asset.id))
            fail("Asset duplicado ou fora do layout SHA-256.");
        bundle.assets.insert(asset.id, asset);
    }
    checkAssetRefs(domains, bundle.assets);
    for (const auto& value : checkedArray(bundle.manifest, "references", "manifest")) {
        const auto reference = checkedObject(value, "reference");
        for (const auto& field : { "from", "relation", "to" }) checkedString(reference, field, "reference");
    }
    // Metadata validation is cheap even for large videos; SHA verification is intentionally deferred.
    for (const auto& asset : bundle.assets) safeFile(bundle, asset);
    return bundle;
}

QString NativeDataReader::assetPath(const NativeBundle& bundle, const QString& id) {
    if (!bundle.assets.contains(id)) fail("ID de asset inexistente.");
    return safeFile(bundle, bundle.assets.value(id));
}

bool NativeDataReader::verifyAsset(const NativeBundle& bundle, const QString& id, QString* error) {
    try {
        const auto asset = bundle.assets.value(id);
        if (asset.id.isEmpty()) fail("ID de asset inexistente.");
        QFile file(assetPath(bundle, id));
        if (!file.open(QIODevice::ReadOnly)) fail("Não foi possível abrir mídia.");
        QCryptographicHash hash(QCryptographicHash::Sha256);
        qint64 total = 0;
        while (!file.atEnd()) {
            const auto chunk = file.read(1024 * 1024);
            if (chunk.isEmpty() && file.error() != QFile::NoError) fail("Falha ao ler mídia.");
            total += chunk.size();
            hash.addData(chunk);
        }
        if (total != asset.byteLength || QString::fromLatin1(hash.result().toHex()) != asset.sha256)
            fail("SHA-256 ou tamanho da mídia não confere.");
        if (error) error->clear();
        return true;
    } catch (const std::exception& exception) {
        if (error) *error = QString::fromUtf8(exception.what());
        return false;
    }
}
} // namespace nymi
