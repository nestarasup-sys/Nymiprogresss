#include "FabricatorProjectReader.hpp"
#include <QCoreApplication>
#include <QCryptographicHash>
#include <QDir>
#include <QFile>
#include <QJsonArray>
#include <QTemporaryDir>
#include <stdexcept>

static void check(bool value) { if (!value) throw std::runtime_error("Teste de projeto Fabricador falhou."); }
int main(int argc, char** argv) {
    QCoreApplication app(argc, argv);
    QTemporaryDir dir;
    check(dir.isValid());
    const QByteArray png = "test-image-bytes";
    const auto sha = QString::fromLatin1(QCryptographicHash::hash(png, QCryptographicHash::Sha256).toHex());
    const auto relativeAsset = "assets/sha256/" + sha.left(2) + "/" + sha;
    QDir().mkpath(QDir(dir.path()).absoluteFilePath("assets/sha256/" + sha.left(2)));
    QFile f(QDir(dir.path()).filePath(relativeAsset));
    check(f.open(QIODevice::WriteOnly) && f.write(png) == png.size());
    f.close();
    nymi::NativeBundle bundle;
    bundle.root = dir.path();
    nymi::NativeAsset asset;
    asset.id = "sha256:" + sha;
    asset.sha256 = sha;
    asset.path = relativeAsset;
    asset.byteLength = png.size();
    bundle.assets.insert(asset.id, asset);
    const QJsonObject part1{{"id", "body"}, {"name", "Tronco"}, {"x", 12.0}, {"y", 20.0},
                            {"width", 60.0}, {"height", 90.0}, {"rotation", 0.0}};
    const QJsonObject part2{{"id", "head"}, {"name", "Cabeca"}, {"x", 22.0}, {"y", 3.0},
                            {"width", 50.0}, {"height", 42.0}, {"rotation", 8.0}};
    const QJsonObject project{{"schemaVersion", 1}, {"slot", 1}, {"name", "Modelo A"}, {"width", 300.0},
        {"height", 400.0}, {"parts", QJsonArray{part1, part2}}, {"joints", QJsonArray{}},
        {"layerOrder", QJsonArray{"head", "body"}}, {"hiddenPartIds", QJsonArray{"head"}}};
    const QJsonObject file{{"relativePath", "slot-1/project.json"}, {"document", project}};
    const QJsonObject image1{{"relativePath", "slot-1/parts/body.png"}, {"asset", QJsonObject{{"$asset", asset.id}}}};
    const QJsonObject image2{{"relativePath", "slot-1/parts/head.png"}, {"asset", QJsonObject{{"$asset", asset.id}}}};
    bundle.manifest = QJsonObject{{"domains", QJsonObject{
        {"fabricator", QJsonObject{{"data", QJsonObject{{"files", QJsonArray{file, image1, image2}}}}}}
    }}};
    const auto result = nymi::FabricatorProjectReader::scan(bundle);
    check(result.issues.isEmpty());
    check(result.models.size() == 1);
    check(result.models[0].parts.size() == 2);
    check(result.models[0].parts[0].id == "head" && result.models[0].parts[0].hidden);
    check(result.models[0].parts[1].id == "body");
    // A single missing converted image must flag the model, not draw an invisible part.
    auto domains = bundle.manifest.value("domains").toObject();
    auto fab = domains.value("fabricator").toObject();
    auto data = fab.value("data").toObject();
    data.insert("files", QJsonArray{file, image1});
    fab.insert("data", data);
    domains.insert("fabricator", fab);
    bundle.manifest.insert("domains", domains);
    const auto broken = nymi::FabricatorProjectReader::scan(bundle);
    check(broken.models.isEmpty() && !broken.issues.isEmpty());
}
