#include "NativeDataReader.hpp"
#include <QCoreApplication>
#include <QTextStream>
#include <QStringList>
#include <QJsonArray>

int main(int argc, char** argv) {
    QCoreApplication app(argc, argv);
    QTextStream out(stdout), err(stderr);
    const auto args = app.arguments();
    if (args.size() < 2 || args.size() > 3 || (args.size() == 3 && args.at(2) != "--deep")) {
        err << "Uso: nymi-native-verify <pasta-do-bundle-v1> [--deep]\n";
        return 2;
    }
    try {
        const auto bundle = nymi::NativeDataReader::open(args.at(1));
        if (args.contains("--deep")) {
            for (const auto& id : bundle.assets.keys()) {
                QString reason;
                if (!nymi::NativeDataReader::verifyAsset(bundle, id, &reason)) {
                    err << "Integridade falhou: " << id << " - " << reason << "\n";
                    return 3;
                }
            }
        }
        const auto characters = bundle.domain("customizer").value("entities").toArray().size();
        const auto videos = bundle.domain("baseVideos").value("catalog").toObject().value("videos").toArray().size();
        out << "Formato nativo v1 válido. Personagens: " << characters
            << "; vídeos: " << videos << "; assets: " << bundle.assets.size() << ".\n";
        out << (args.contains("--deep") ? "SHA-256 verificado em todos os assets.\n" : "Metadados/tamanhos validados; use --deep para todos os SHA-256.\n");
        return 0;
    } catch (const std::exception& exception) {
        err << "Falha de validação: " << exception.what() << "\n";
        return 1;
    }
}
