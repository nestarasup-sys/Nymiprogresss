#include "AppBridge.hpp"
#include <QGuiApplication>
#include <QQmlApplicationEngine>
#include <QQmlError>
#include <QtQml>

int main(int argc, char* argv[]) {
    QGuiApplication app(argc, argv);
    qmlRegisterType<AppBridge>("Nymi.Native", 1, 0, "AppBridge");
    QQmlApplicationEngine engine;
    engine.loadFromModule("NymiDesktop", "Main");
    if (engine.rootObjects().isEmpty()) return 1;
    return app.exec();
}
