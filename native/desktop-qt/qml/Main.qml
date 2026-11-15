import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import QtQuick.Dialogs
import QtMultimedia

ApplicationWindow {
    id: window
    visible: true
    width: 1440
    height: 860
    minimumWidth: 1060
    minimumHeight: 630
    title: "Nymiprogresss — Desktop nativo"
    color: "#10151e"
    property string selectedModule: "Fabricador DEV"
    property string searchText: ""
    property var selectedItem: null
    readonly property var modules: ["Fabricador DEV", "Customizador", "Base de vídeos",
        "Studio", "Roteiros", "Editor V6", "Biblioteca V6", "Logs DEV"]
    readonly property bool activeDataModule: selectedModule === "Fabricador DEV"
        || selectedModule === "Customizador" || selectedModule === "Base de vídeos"
    function entries() {
        var all = selectedModule === "Fabricador DEV" ? nativeBridge.fabricatorItems :
                  selectedModule === "Customizador" ? nativeBridge.characterItems :
                  selectedModule === "Base de vídeos" ? nativeBridge.videoItems : []
        if (!searchText.trim()) return all
        var query = searchText.toLowerCase()
        return all.filter(function(entry) {
            return (entry.title + " " + entry.subtitle + " " + entry.id).toLowerCase().indexOf(query) >= 0
        })
    }
    FolderDialog {
        id: chooseBundle
        title: "Selecione a pasta nymiprogress-native-data-v1-final"
        onAccepted: {
            nativeBridge.loadBundle(selectedFolder.toLocalFile())
            window.selectedItem = null
        }
    }
    MediaPlayer {
        id: player
        source: nativeBridge.videoSource
        videoOutput: output
        audioOutput: AudioOutput {}
    }
    Connections {
        target: nativeBridge
        function onVideoSourceChanged() {
            if (nativeBridge.videoSource.toString().length > 0) player.play()
            else player.stop()
        }
    }

    ColumnLayout {
        anchors.fill: parent
        spacing: 0
        Rectangle {
            Layout.fillWidth: true
            Layout.preferredHeight: 82
            color: "#192436"
            RowLayout {
                anchors.fill: parent
                anchors.leftMargin: 24
                anchors.rightMargin: 24
                spacing: 18
                ColumnLayout {
                    spacing: 2
                    Label { text: "NYMIPROGRESSS"; color: "#f0f5fc"; font.bold: true; font.pixelSize: 23 }
                    Label { text: "Qt 6 + C++20  •  dados nativos v1"; color: "#a9b8cf"; font.pixelSize: 12 }
                }
                Item { Layout.fillWidth: true }
                Label {
                    text: nativeBridge.loaded ? "Dados nativos carregados" : "Nenhum bundle aberto"
                    color: nativeBridge.loaded ? "#7be0b4" : "#ffc67e"
                }
                Button { text: "Abrir dados locais"; onClicked: chooseBundle.open() }
            }
        }
        Rectangle {
            Layout.fillWidth: true
            Layout.preferredHeight: 46
            color: "#121d29"
            Label {
                anchors.fill: parent
                anchors.margins: 12
                color: "#b5c6dd"
                elide: Text.ElideRight
                verticalAlignment: Text.AlignVCenter
                text: nativeBridge.status
            }
        }
        RowLayout {
            Layout.fillWidth: true
            Layout.fillHeight: true
            spacing: 0

            Rectangle {
                Layout.fillHeight: true
                Layout.preferredWidth: 246
                color: "#192230"
                ColumnLayout {
                    anchors.fill: parent
                    anchors.margins: 16
                    spacing: 7
                    Label { text: "ÁREAS DO APP"; color: "#8ea5c1"; font.bold: true; font.pixelSize: 12 }
                    Repeater {
                        model: window.modules
                        delegate: Button {
                            required property string modelData
                            Layout.fillWidth: true
                            text: modelData
                            highlighted: modelData === window.selectedModule
                            onClicked: {
                                window.selectedModule = modelData
                                window.selectedItem = null
                                window.searchText = ""
                                searchField.text = ""
                                nativeBridge.clearVideo()
                            }
                        }
                    }
                    Item { Layout.fillHeight: true }
                    Label {
                        Layout.fillWidth: true
                        wrapMode: Text.WordWrap
                        font.pixelSize: 12
                        color: "#7e93ad"
                        text: "Dados privados permanecem no seu computador. Nenhum arquivo é enviado ao GitHub."
                    }
                }
            }
            Loader {
                Layout.fillWidth: true
                Layout.fillHeight: true
                active: window.selectedModule === "Fabricador DEV"
                visible: active
                source: "FabricatorPage.qml"
            }
            ColumnLayout {
                visible: window.selectedModule !== "Fabricador DEV"
                Layout.fillHeight: true
                Layout.preferredWidth: 425
                Layout.minimumWidth: 280
                spacing: 0
                Rectangle {
                    Layout.fillWidth: true
                    Layout.preferredHeight: 124
                    color: "#111a27"
                    ColumnLayout {
                        anchors.fill: parent
                        anchors.margins: 16
                        spacing: 12
                        Label {
                            text: window.selectedModule
                            font.pixelSize: 23
                            font.bold: true
                            color: "#eef5ff"
                        }
                        TextField {
                            id: searchField
                            Layout.fillWidth: true
                            placeholderText: "Buscar por nome ou ID..."
                            enabled: window.activeDataModule && nativeBridge.loaded
                            onTextChanged: window.searchText = text
                        }
                    }
                }
                ListView {
                    id: entriesList
                    Layout.fillWidth: true
                    Layout.fillHeight: true
                    clip: true
                    spacing: 2
                    model: window.entries()
                    delegate: Rectangle {
                        required property var modelData
                        width: entriesList.width
                        height: 76
                        radius: 6
                        color: mouse.containsMouse ? "#28364c" : "#1b2736"
                        MouseArea {
                            id: mouse
                            anchors.fill: parent
                            hoverEnabled: true
                            onClicked: {
                                window.selectedItem = modelData
                                if (window.selectedModule === "Base de vídeos")
                                    nativeBridge.verifyAndOpenVideo(modelData.id)
                            }
                        }
                        Column {
                            anchors.fill: parent
                            anchors.margins: 12
                            spacing: 5
                            Label {
                                width: parent.width
                                text: modelData.title || modelData.id
                                font.bold: true
                                elide: Text.ElideRight
                                color: "#f1f5fb"
                            }
                            Label {
                                width: parent.width
                                text: modelData.subtitle || modelData.kind
                                color: "#9baec6"
                                elide: Text.ElideRight
                                font.pixelSize: 12
                            }
                        }
                    }
                    ScrollBar.vertical: ScrollBar {}
                }
                Label {
                    Layout.margins: 12
                    color: "#7e93ad"
                    text: window.activeDataModule && nativeBridge.loaded
                          ? window.entries().length + " registros exibidos" : "Módulo aguardando migração nativa"
                }
            }
            Rectangle {
                visible: window.selectedModule !== "Fabricador DEV"
                Layout.fillWidth: true
                Layout.fillHeight: true
                color: "#121b28"
                ColumnLayout {
                    anchors.fill: parent
                    anchors.margins: 24
                    spacing: 14
                    Label { text: "DETALHES"; color: "#8ea5c1"; font.pixelSize: 12; font.bold: true }
                    Label {
                        Layout.fillWidth: true
                        wrapMode: Text.WordWrap
                        font.pixelSize: 24
                        font.bold: true
                        color: "#f1f5fb"
                        text: window.selectedItem ? window.selectedItem.title : "Selecione um registro"
                    }
                    Label {
                        Layout.fillWidth: true
                        wrapMode: Text.WrapAnywhere
                        color: "#9cb0c7"
                        text: window.selectedItem ? window.selectedItem.subtitle + "\nID: " + window.selectedItem.id
                                                  : "Os três módulos com dados migrados já podem ser explorados."
                    }
                    Rectangle {
                        Layout.fillWidth: true
                        Layout.fillHeight: true
                        radius: 12
                        color: "#080e17"
                        visible: window.selectedModule === "Base de vídeos"
                        VideoOutput {
                            id: output
                            anchors.fill: parent
                            fillMode: VideoOutput.PreserveAspectFit
                        }
                        Label {
                            anchors.centerIn: parent
                            visible: nativeBridge.videoSource.toString().length === 0
                            text: "Selecione um vídeo para verificar e reproduzir"
                            color: "#839bb7"
                        }
                    }
                    Label {
                        Layout.fillWidth: true
                        wrapMode: Text.WordWrap
                        color: "#a7c8e3"
                        visible: window.selectedModule === "Base de vídeos"
                        text: nativeBridge.videoVerification
                    }
                    RowLayout {
                        visible: window.selectedModule === "Base de vídeos"
                        Button { text: "Reproduzir"; enabled: nativeBridge.videoSource.toString().length > 0; onClicked: player.play() }
                        Button { text: "Pausar"; enabled: nativeBridge.videoSource.toString().length > 0; onClicked: player.pause() }
                        Button { text: "Parar"; onClicked: player.stop() }
                    }
                    Item { Layout.fillHeight: window.selectedModule !== "Base de vídeos" }
                    Label {
                        Layout.fillWidth: true
                        wrapMode: Text.WordWrap
                        color: "#839bb7"
                        visible: !window.activeDataModule
                        text: "Esta área continua disponível no aplicativo legado. A versão Qt ainda não reproduz suas ferramentas completas."
                    }
                }
            }
        }
    }
}
