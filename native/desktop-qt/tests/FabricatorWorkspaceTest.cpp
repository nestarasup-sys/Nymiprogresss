#include "FabricatorWorkspace.hpp"
#include <QCoreApplication>
#include <QCryptographicHash>
#include <QDir>
#include <QFile>
#include <QJsonArray>
#include <QStandardPaths>
#include <QTemporaryDir>
#include <stdexcept>

static void require(bool value) { if (!value) throw std::runtime_error("Falha no teste do workspace do Fabricador."); }
int main(int argc, char** argv) {
    QCoreApplication app(argc, argv);
    QCoreApplication::setOrganizationName("NymiTest");
    QCoreApplication::setApplicationName("NymiFabricatorTest");
    QStandardPaths::setTestModeEnabled(true);
    QTemporaryDir temp;
    require(temp.isValid());
    nymi::NativeBundle bundle;
    bundle.root = temp.path();
    const QByteArray image = "test-image";
    const auto sha = QString::fromLatin1(QCryptographicHash::hash(image, QCryptographicHash::Sha256).toHex());
    const auto id = "sha256:" + sha;
    const auto relative = "assets/sha256/" + sha.left(2) + "/" + sha;
    QDir().mkpath(temp.filePath("assets/sha256/" + sha.left(2)));
    QFile img(temp.filePath(relative));
    require(img.open(QIODevice::WriteOnly) && img.write(image) == image.size());
    img.close();
    nymi::NativeAsset asset;
    asset.id = id; asset.path = relative; asset.sha256 = sha; asset.byteLength = image.size();
    bundle.assets.insert(id, asset);
    QJsonObject project{
        {"slot", 1}, {"name", "Teste"}, {"width", 300.0}, {"height", 400.0},
        {"parts", QJsonArray{QJsonObject{{"id", "p1"}, {"name", "Cabeca"},
            {"x", 20.0}, {"y", 40.0}, {"width", 100.0}, {"height", 120.0}, {"rotation", 0.0}}}},
        {"joints", QJsonArray{}}
    };
    const auto files = QJsonArray{
        QJsonObject{{"relativePath", "slot-1/project.json"}, {"document", project}},
        QJsonObject{{"relativePath", "slot-1/parts/p1.png"}, {"asset", QJsonObject{{"$asset", id}}}}
    };
    bundle.manifest = QJsonObject{{"domains", QJsonObject{
        {"fabricator", QJsonObject{{"data", QJsonObject{{"files", files}}}}}
    }}};
    FabricatorWorkspace fab;
    fab.setBundle(bundle);
    require(fab.slots().size() == 10);
    require(fab.parts().size() == 1 && !fab.modelInfo().isEmpty());
    fab.selectPart("p1");
    fab.beginGesture();
    fab.setPartPosition("p1", 45, 55);
    fab.setPartRotation("p1", -15);
    fab.endGesture();
    require(fab.canUndo());
    require(fab.selectedPart().value("x").toDouble() == 45);
    fab.undo();
    require(fab.selectedPart().value("x").toDouble() == 20);
    fab.redo();
    require(fab.selectedPart().value("rotation").toDouble() == -15);
    require(fab.saveDraft());
    fab.resetWorking();
    require(fab.selectedPart().value("x").toDouble() == 20);
    require(fab.loadDraft());
    require(fab.selectedPart().value("x").toDouble() == 45);
    fab.selectSlot(2);
    require(fab.parts().isEmpty());
    fab.selectSlot(1);
    require(fab.discardDraft());
    require(!fab.loadDraft());
}
