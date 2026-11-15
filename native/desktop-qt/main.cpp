#include "AppBridge.hpp"
#include <QCommandLineParser>
#include <QGuiApplication>
#include <QQmlApplicationEngine>
#include <QQmlContext>
#include <QTimer>
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
    QCommandLineOption smokeOption(QStringList{"smoke-test"}, "Teste de abertura da interface QML e encerramento automatico.");
    parser.addOption(smokeOption);
    parser.process(app);

    AppBridge bridge;
    QString folder = parser.value(dataOption);
    if (folder.isEmpty()) folder = qEnvironmentVariable("NYMI_NATIVE_DATA_DIR");
    if (!folder.isEmpty()) bridge.loadBundle(folder);

    QQmlApplicationEngine engine;
    engine.rootContext()->setContextProperty("nativeBridge", &bridge);
    engine.load(QUrl(QStringLiteral("qrc:/qt/qml/NymiDesktop/Main.qml")));
    if (engine.rootObjects().isEmpty()) return 1;
    if (parser.isSet(smokeOption)) QTimer::singleShot(1500, &app, &QCoreApplication::quit);
    return app.exec();
}
