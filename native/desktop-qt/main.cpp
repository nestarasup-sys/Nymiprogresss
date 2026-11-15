#include "AppBridge.hpp"
#include <QCommandLineParser>
#include <QGuiApplication>
#include <QQmlApplicationEngine>
#include <QQmlContext>
#include <QUrl>

int main(int argc, char* argv[]) {
    QGuiApplication app(argc, argv);
    app.setApplicationName("Nymiprogresss");
    app.setOrganizationName("Nymi");
    QCommandLineParser parser;
    parser.setApplicationDescription("Nymiprogresss desktop nativo • Qt/C++");
    parser.addHelpOption();
    QCommandLineOption dataOption(QStringList{"data-dir"},
        "Pasta privada que contém o manifest.json nativo v1.", "pasta");
    parser.addOption(dataOption);
    parser.process(app);

    AppBridge bridge;
    QString folder = parser.value(dataOption);
    if (folder.isEmpty()) folder = qEnvironmentVariable("NYMI_NATIVE_DATA_DIR");
    if (!folder.isEmpty()) bridge.loadBundle(folder);

    QQmlApplicationEngine engine;
    engine.rootContext()->setContextProperty("nativeBridge", &bridge);
    engine.load(QUrl(QStringLiteral("qrc:/qt/qml/NymiDesktop/Main.qml")));
    if (engine.rootObjects().isEmpty()) return 1;
    return app.exec();
}
