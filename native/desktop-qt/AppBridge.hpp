#pragma once
#include <QObject>

class AppBridge : public QObject {
    Q_OBJECT
public:
    explicit AppBridge(QObject* parent = nullptr);
    Q_INVOKABLE double sampleNormalizedPosition(double seconds) const;
};
