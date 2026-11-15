#pragma once
#include "FabricatorProjectReader.hpp"
#include <QObject>
#include <QVariantList>
#include <QVariantMap>
#include <optional>

class FabricatorWorkspace : public QObject {
    Q_OBJECT
    Q_PROPERTY(QVariantList slots READ slots NOTIFY changed)
    Q_PROPERTY(QVariantList parts READ parts NOTIFY changed)
    Q_PROPERTY(QVariantList joints READ joints NOTIFY changed)
    Q_PROPERTY(QVariantMap selectedPart READ selectedPart NOTIFY changed)
    Q_PROPERTY(QVariantMap modelInfo READ modelInfo NOTIFY changed)
    Q_PROPERTY(QString selectedPartId READ selectedPartId NOTIFY changed)
    Q_PROPERTY(QString error READ error NOTIFY changed)
    Q_PROPERTY(int selectedSlot READ selectedSlot NOTIFY changed)
    Q_PROPERTY(double zoom READ zoom NOTIFY changed)
    Q_PROPERTY(double panX READ panX NOTIFY changed)
    Q_PROPERTY(double panY READ panY NOTIFY changed)
    Q_PROPERTY(bool dirty READ dirty NOTIFY changed)
    Q_PROPERTY(bool canUndo READ canUndo NOTIFY changed)
    Q_PROPERTY(bool canRedo READ canRedo NOTIFY changed)
public:
    explicit FabricatorWorkspace(QObject* parent = nullptr);
    void setBundle(const nymi::NativeBundle& bundle);
    QVariantList slots() const;
    QVariantList parts() const;
    QVariantList joints() const;
    QVariantMap selectedPart() const;
    QVariantMap modelInfo() const;
    QString selectedPartId() const { return selectedPartId_; }
    QString error() const { return error_; }
    int selectedSlot() const { return selectedSlot_; }
    double zoom() const { return zoom_; }
    double panX() const { return panX_; }
    double panY() const { return panY_; }
    bool dirty() const { return dirty_; }
    bool canUndo() const { return !undo_.isEmpty(); }
    bool canRedo() const { return !redo_.isEmpty(); }

    Q_INVOKABLE void selectSlot(int slot);
    Q_INVOKABLE void selectPart(const QString& id);
    Q_INVOKABLE void setZoom(double factor);
    Q_INVOKABLE void setPan(double x, double y);
    Q_INVOKABLE void centerView();
    Q_INVOKABLE void setPartPosition(const QString& id, double x, double y);
    Q_INVOKABLE void setPartRotation(const QString& id, double rotation);
    Q_INVOKABLE void setPartVisible(const QString& id, bool visible);
    Q_INVOKABLE void beginGesture();
    Q_INVOKABLE void endGesture();
    Q_INVOKABLE void undo();
    Q_INVOKABLE void redo();
    Q_INVOKABLE void resetWorking();
    Q_INVOKABLE bool saveDraft();
    Q_INVOKABLE bool loadDraft();
    Q_INVOKABLE bool discardDraft();
signals:
    void changed();
private:
    QVariantMap mapPart(const nymi::FabricatorPart& part) const;
    nymi::FabricatorPart* mutablePart(const QString& id);
    void beforeChange();
    void clearEditState();
    QString draftPath() const;
    void changedState();
    QVector<nymi::FabricatorModel> models_;
    std::optional<nymi::FabricatorModel> working_;
    std::optional<nymi::FabricatorModel> original_;
    QVector<nymi::FabricatorModel> undo_, redo_;
    std::optional<nymi::FabricatorModel> gestureBefore_;
    QString selectedPartId_, error_;
    int selectedSlot_ = 1;
    double zoom_ = 1.0, panX_ = 0.0, panY_ = 0.0;
    bool dirty_ = false;
    bool gestureChanged_ = false;
};
