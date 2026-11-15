import QtQuick
import QtQuick.Controls
import QtQuick.Layouts

Item {
    id: page
    readonly property var fab: nativeBridge.fabricator
    property string activeSection: "Modelos"
    property string panelTab: "Peças"
    readonly property var sections: [
        ["Modelos", "Modelos Dev"], ["Poses", "Poses Dev"], ["Roupas", "Roupas Dev"],
        ["Olhos", "Olhos Dev"], ["Rosto", "Rosto Dev"],
        ["Preset Expressão Dev", "Preset Expressão Dev"], ["Animador Rosto Dev", "Animador Rosto Dev"],
        ["Cabeças extra", "Cabeças extra dev"], ["Cabelos Dev", "Cabelos Dev"],
        ["Animação Cabelo Dev", "Animação Cabelo Dev"], ["Animador Dev", "Animador Dev"],
        ["Design Dev", "Design Dev"]
    ]
    Dialog {
        id: confirmReset
        title: "Restaurar posições originais?"
        modal: true
        standardButtons: Dialog.Ok | Dialog.Cancel
        anchors.centerIn: parent
        onAccepted: fab.resetWorking()
    }
    Dialog {
        id: confirmDeleteDraft
        title: "Excluir somente o rascunho local?"
        modal: true
        standardButtons: Dialog.Ok | Dialog.Cancel
        anchors.centerIn: parent
        onAccepted: fab.discardDraft()
    }
    RowLayout {
        anchors.fill: parent
        spacing: 0
        Rectangle {
            Layout.preferredWidth: 174
            Layout.fillHeight: true
            color: "#141e2b"
            ColumnLayout {
                anchors.fill: parent
                anchors.margins: 9
                spacing: 5
                Label { text: "FABRICADOR DEV"; color: "#e5effe"; font.bold: true; font.pixelSize: 13 }
                Label { text: "ÁREAS DE PRODUÇÃO"; color: "#8096b2"; font.pixelSize: 10 }
                ScrollView {
                    Layout.fillWidth: true
                    Layout.fillHeight: true
                    clip: true
                    Column {
                        width: 153
                        spacing: 4
                        Repeater {
                            model: page.sections
                            delegate: Button {
                                required property var modelData
                                width: 153
                                height: 37
                                font.pixelSize: 11
                                text: modelData[1]
                                highlighted: page.activeSection === modelData[0]
                                onClicked: page.activeSection = modelData[0]
                            }
                        }
                    }
                }
            }
        }
        ColumnLayout {
            Layout.fillWidth: true
            Layout.fillHeight: true
            spacing: 0
            Rectangle {
                Layout.fillWidth: true
                Layout.preferredHeight: 94
                color: "#192838"
                ColumnLayout {
                    anchors.fill: parent
                    anchors.margins: 9
                    spacing: 8
                    RowLayout {
                        Label { text: page.activeSection; color: "#f0f6ff"; font.pixelSize: 18; font.bold: true }
                        Item { Layout.fillWidth: true }
                        Label { text: fab.dirty ? "Alterações ainda não salvas" : "Dados nativos • somente leitura"; color: fab.dirty ? "#efc06f" : "#96b6d4"; font.pixelSize: 11 }
                    }
                    RowLayout {
                        visible: page.activeSection === "Modelos"
                        spacing: 3
                        Repeater {
                            model: fab.slots
                            delegate: Button {
                                required property var modelData
                                Layout.fillWidth: true
                                Layout.minimumWidth: 36
                                height: 37
                                text: String(modelData.slot).padStart(2,"0")
                                font.pixelSize: 12
                                highlighted: fab.selectedSlot === modelData.slot
                                ToolTip.visible: hovered
                                ToolTip.text: modelData.name + " • " + modelData.partCount + " peças"
                                onClicked: fab.selectSlot(modelData.slot)
                            }
                        }
                    }
                }
            }
            Rectangle {
                Layout.fillWidth: true
                Layout.fillHeight: true
                color: "#0d1520"
                visible: page.activeSection !== "Modelos"
                ColumnLayout {
                    anchors.centerIn: parent
                    width: Math.min(parent.width - 40, 540)
                    Label { Layout.fillWidth: true; text: page.activeSection; color: "#e9f3ff"; horizontalAlignment: Text.AlignHCenter; font.pixelSize: 24 }
                    Label {
                        Layout.fillWidth: true
                        wrapMode: Text.WordWrap
                        horizontalAlignment: Text.AlignHCenter
                        color: "#9cacc3"
                        text: "Esta seção existe no Fabricador original. Os arquivos convertidos estão preservados; suas ferramentas nativas ainda serão reconstruídas."
                    }
                }
            }
            RowLayout {
                Layout.fillWidth: true
                Layout.fillHeight: true
                spacing: 0
                visible: page.activeSection === "Modelos"
                Rectangle {
                    Layout.fillWidth: true
                    Layout.fillHeight: true
                    color: "#09121c"
                    ColumnLayout {
                        anchors.fill: parent
                        spacing: 0
                        Rectangle {
                            Layout.fillWidth: true
                            Layout.preferredHeight: 31
                            color: "#182536"
                            RowLayout {
                                anchors.fill: parent
                                anchors.leftMargin: 10
                                anchors.rightMargin: 10
                                Label { text: "CANVAS DE MONTAGEM"; color: "#97b4cf"; font.pixelSize: 11; font.bold: true }
                                Item { Layout.fillWidth: true }
                                Label {
                                    text: (fab.modelInfo.width || 0) + " × " + (fab.modelInfo.height || 0)
                                    color: "#b3c3d3"
                                }
                            }
                        }
                        Item {
                            id: stage
                            Layout.fillWidth: true
                            Layout.fillHeight: true
                            clip: true
                            property bool panning: false
                            property real startX: 0
                            property real startY: 0
                            property real originX: 0
                            property real originY: 0
                            Rectangle {
                                anchors.fill: parent
                                color: "#101c2b"
                            }
                            MouseArea {
                                anchors.fill: parent
                                acceptedButtons: Qt.LeftButton | Qt.MiddleButton
                                onPressed: function(mouse) {
                                    stage.panning = true
                                    stage.startX = mouse.x
                                    stage.startY = mouse.y
                                    stage.originX = fab.panX
                                    stage.originY = fab.panY
                                    fab.selectPart("")
                                }
                                onPositionChanged: function(mouse) {
                                    if (stage.panning) fab.setPan(stage.originX + mouse.x - stage.startX,
                                                                  stage.originY + mouse.y - stage.startY)
                                }
                                onReleased: stage.panning = false
                                onCanceled: stage.panning = false
                                onWheel: function(wheel) {
                                    fab.setZoom(fab.zoom * (wheel.angleDelta.y > 0 ? 1.12 : 1 / 1.12))
                                    wheel.accepted = true
                                }
                            }
                            Item {
                                id: artboard
                                readonly property real scaleValue: Math.max(0.15, Math.min(stage.width / Math.max(1, fab.modelInfo.width || 1),
                                                                                           stage.height / Math.max(1, fab.modelInfo.height || 1))) * fab.zoom * 0.84
                                width: (fab.modelInfo.width || 1) * scaleValue
                                height: (fab.modelInfo.height || 1) * scaleValue
                                x: (stage.width - width) / 2 + fab.panX
                                y: (stage.height - height) / 2 + fab.panY
                                Rectangle { anchors.fill: parent; color: "#fff"; opacity: 0.08; border.color: "#8caaca"; border.width: 1 }
                                Repeater {
                                    model: fab.parts
                                    delegate: Item {
                                        required property var modelData
                                        x: partDrag.pressed && partDrag.moved ? partDrag.previewX * artboard.scaleValue : modelData.x * artboard.scaleValue
                                        y: partDrag.pressed && partDrag.moved ? partDrag.previewY * artboard.scaleValue : modelData.y * artboard.scaleValue
                                        width: modelData.width * artboard.scaleValue
                                        height: modelData.height * artboard.scaleValue
                                        visible: !modelData.hidden
                                        transform: Rotation {
                                            origin.x: modelData.width * artboard.scaleValue / 2
                                            origin.y: modelData.height * artboard.scaleValue / 2
                                            angle: modelData.rotation
                                        }
                                        Image {
                                            anchors.fill: parent
                                            source: modelData.imageUrl
                                            asynchronous: true
                                            cache: true
                                            smooth: true
                                            fillMode: Image.Stretch
                                        }
                                        Rectangle {
                                            anchors.fill: parent
                                            color: "transparent"
                                            border.color: modelData.selected ? "#69d6aa" : "transparent"
                                            border.width: 2
                                        }
                                        MouseArea {
                                            id: partDrag
                                            anchors.fill: parent
                                            property real startSceneX: 0
                                            property real startSceneY: 0
                                            property real originalX: 0
                                            property real originalY: 0
                                            property real previewX: modelData.x
                                            property real previewY: modelData.y
                                            property bool moved: false
                                            onPressed: function(mouse) {
                                                // Do not notify the model while the MouseArea holds the drag.
                                                var point = mapToItem(stage, mouse.x, mouse.y)
                                                startSceneX = point.x
                                                startSceneY = point.y
                                                originalX = modelData.x
                                                originalY = modelData.y
                                                previewX = originalX
                                                previewY = originalY
                                                moved = false
                                            }
                                            onPositionChanged: function(mouse) {
                                                if (!pressed) return
                                                var point = mapToItem(stage, mouse.x, mouse.y)
                                                var dx = (point.x - startSceneX) / artboard.scaleValue
                                                var dy = (point.y - startSceneY) / artboard.scaleValue
                                                if (Math.abs(dx) + Math.abs(dy) > 0.25) moved = true
                                                if (moved) {
                                                    previewX = originalX + dx
                                                    previewY = originalY + dy
                                                }
                                            }
                                            onReleased: {
                                                var id = modelData.id
                                                var nextX = previewX
                                                var nextY = previewY
                                                if (moved) fab.setPartPosition(id, nextX, nextY)
                                                fab.selectPart(id)
                                            }
                                        }
                                    }
                                }
                            }
                            Label {
                                anchors.centerIn: parent
                                visible: !fab.modelInfo.width
                                horizontalAlignment: Text.AlignHCenter
                                color: "#91a4bd"
                                text: "Slot vazio ou modelo não reconhecido no formato convertido.\nSelecione outro slot."
                            }
                            Row {
                                anchors.right: parent.right
                                anchors.bottom: parent.bottom
                                anchors.margins: 12
                                spacing: 5
                                Button { text: "−"; onClicked: fab.setZoom(fab.zoom / 1.2) }
                                Label { text: Math.round(fab.zoom * 100) + "%"; color: "#cedaeb"; anchors.verticalCenter: parent.verticalCenter }
                                Button { text: "+"; onClicked: fab.setZoom(fab.zoom * 1.2) }
                                Button { text: "Centralizar"; onClicked: fab.centerView() }
                            }
                        }
                        Rectangle {
                            Layout.fillWidth: true
                            Layout.preferredHeight: 38
                            color: "#172535"
                            Label {
                                anchors.fill: parent
                                anchors.margins: 8
                                verticalAlignment: Text.AlignVCenter
                                color: "#9aafc9"
                                font.pixelSize: 11
                                text: fab.modelInfo.name ? fab.modelInfo.name + " • " + (fab.modelInfo.partCount || 0) + " peças • " + (fab.modelInfo.jointCount || 0) + " juntas" : fab.error || "Modelo não disponível."
                                elide: Text.ElideRight
                            }
                        }
                    }
                }
                Rectangle {
                    Layout.preferredWidth: 262
                    Layout.fillHeight: true
                    color: "#192536"
                    ColumnLayout {
                        anchors.fill: parent
                        anchors.margins: 10
                        spacing: 8
                        Label { text: "MONTAGEM"; color: "#93a7bf"; font.pixelSize: 11; font.bold: true }
                        Label { text: fab.modelInfo.name || "Sem modelo"; color: "#edf5ff"; font.pixelSize: 16; font.bold: true }
                        TabBar {
                            Layout.fillWidth: true
                            currentIndex: ["Peças","Camadas","Juntas"].indexOf(page.panelTab)
                            Repeater {
                                model: ["Peças","Camadas","Juntas"]
                                TabButton { required property string modelData; text: modelData; onClicked: page.panelTab = modelData }
                            }
                        }
                        ScrollView {
                            Layout.fillWidth: true
                            Layout.fillHeight: true
                            clip: true
                            Column {
                                width: 235
                                spacing: 4
                                Repeater {
                                    model: page.panelTab === "Juntas" ? fab.joints : fab.parts
                                    delegate: Rectangle {
                                        required property var modelData
                                        width: 235
                                        height: 42
                                        color: modelData.selected ? "#31506a" : "#253246"
                                        radius: 5
                                        Text {
                                            anchors.fill: parent
                                            anchors.margins: 8
                                            text: page.panelTab === "Juntas"
                                                  ? modelData.parentPartId + " → " + modelData.childPartId
                                                  : modelData.name
                                            color: "#e6f0ff"
                                            font.pixelSize: 12
                                            verticalAlignment: Text.AlignVCenter
                                            elide: Text.ElideRight
                                        }
                                        MouseArea {
                                            anchors.fill: parent
                                            enabled: page.panelTab !== "Juntas"
                                            onClicked: fab.selectPart(modelData.id)
                                        }
                                    }
                                }
                            }
                        }
                        Label { text: fab.selectedPart.name || "Selecione uma peça"; color: "#a6c3df"; font.pixelSize: 12 }
                        GridLayout {
                            Layout.fillWidth: true
                            columns: 2
                            visible: !!fab.selectedPart.id
                            Label { text: "X"; color: "#aec4d9" }
                            TextField {
                                Layout.fillWidth: true
                                text: Number(fab.selectedPart.x || 0).toFixed(1)
                                validator: DoubleValidator { bottom: -100000; top: 100000; decimals: 2 }
                                onEditingFinished: fab.setPartPosition(fab.selectedPartId,
                                    Number(text), fab.selectedPart.y)
                            }
                            Label { text: "Y"; color: "#aec4d9" }
                            TextField {
                                Layout.fillWidth: true
                                text: Number(fab.selectedPart.y || 0).toFixed(1)
                                validator: DoubleValidator { bottom: -100000; top: 100000; decimals: 2 }
                                onEditingFinished: fab.setPartPosition(fab.selectedPartId,
                                    fab.selectedPart.x, Number(text))
                            }
                            Label { text: "Rotação"; color: "#aec4d9" }
                            TextField {
                                Layout.fillWidth: true
                                text: Number(fab.selectedPart.rotation || 0).toFixed(1)
                                validator: DoubleValidator { bottom: -3600; top: 3600; decimals: 2 }
                                onEditingFinished: fab.setPartRotation(fab.selectedPartId, Number(text))
                            }
                            Label { text: "Visível"; color: "#aec4d9" }
                            CheckBox {
                                checked: !fab.selectedPart.hidden
                                onClicked: fab.setPartVisible(fab.selectedPartId, checked)
                            }
                        }
                        RowLayout {
                            Layout.fillWidth: true
                            Button { text: "↶"; enabled: fab.canUndo; onClicked: fab.undo(); ToolTip.text: "Desfazer" }
                            Button { text: "↷"; enabled: fab.canRedo; onClicked: fab.redo(); ToolTip.text: "Refazer" }
                            Button { text: "Restaurar"; enabled: !!fab.modelInfo.slot; onClicked: confirmReset.open() }
                        }
                        RowLayout {
                            Layout.fillWidth: true
                            Button { text: "Salvar rascunho"; enabled: !!fab.modelInfo.slot; onClicked: fab.saveDraft() }
                            Button { text: "Carregar"; enabled: !!fab.modelInfo.slot; onClicked: fab.loadDraft() }
                        }
                        Button { text: "Excluir rascunho local"; enabled: !!fab.modelInfo.slot; onClicked: confirmDeleteDraft.open() }
                        Label {
                            Layout.fillWidth: true
                            wrapMode: Text.WordWrap
                            text: fab.error || "Transformações e rascunhos são locais; o bundle convertido nunca é modificado."
                            color: fab.error ? "#efc06f" : "#8a9db8"
                            font.pixelSize: 11
                        }
                    }
                }
            }
        }
    }
}
