import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import Nymi.Native 1.0

ApplicationWindow {
    id: window
    visible: true
    width: 1280
    height: 800
    minimumWidth: 900
    minimumHeight: 560
    title: "Nymi — Fundacao nativa (prototipo)"
    color: "#10141c"
    AppBridge { id: core }
    property var modules: ["Fabricador DEV", "Customizador", "Studio", "Roteiros", "Base de vídeos", "Editor V6", "Biblioteca V6", "Logs DEV"]
    property string selectedModule: "Editor V6"

    RowLayout {
        anchors.fill: parent
        spacing: 0
        Rectangle {
            Layout.fillHeight: true
            Layout.preferredWidth: 250
            color: "#192230"
            ColumnLayout {
                anchors.fill: parent
                anchors.margins: 18
                spacing: 12
                Label { text: "NYMI"; color: "#e9eff8"; font.pixelSize: 24; font.bold: true }
                Label { text: "Ambiente nativo • protótipo"; color: "#a2b2c9" }
                Repeater {
                    model: window.modules
                    delegate: Button {
                        required property string modelData
                        Layout.fillWidth: true
                        text: modelData
                        highlighted: modelData === window.selectedModule
                        onClicked: window.selectedModule = modelData
                    }
                }
                Item { Layout.fillHeight: true }
                Label { Layout.fillWidth: true; wrapMode: Text.WordWrap; color: "#a2b2c9";
                    text: "As áreas completas permanecem no aplicativo legado. Esta janela valida a base Qt/C++." }
            }
        }
        Rectangle {
            Layout.fillWidth: true
            Layout.fillHeight: true
            color: "#10141c"
            ColumnLayout {
                anchors.fill: parent
                anchors.margins: 34
                spacing: 18
                Label { text: window.selectedModule; font.pixelSize: 30; font.bold: true; color: "#eef5ff" }
                Label { Layout.fillWidth: true; wrapMode: Text.WordWrap; color: "#9eb1c9";
                    text: "Primeira prova técnica: timeline determinística em C++, visualizada no Qt Quick. A funcionalidade de produção desta área ainda não foi migrada." }
                Rectangle {
                    id: preview
                    Layout.fillWidth: true
                    Layout.fillHeight: true
                    color: "#202a3b"
                    radius: 12
                    Rectangle {
                        width: 100; height: 100; radius: 16; color: "#54c8a5"
                        x: 24 + (preview.width - width - 48) * core.sampleNormalizedPosition(scrubber.value)
                        y: (preview.height - height) / 2
                    }
                }
                Label { text: "Prévia animada por keyframes em C++ (0 a 3 segundos)"; color: "#d7e2f2" }
                Slider { id: scrubber; Layout.fillWidth: true; from: 0; to: 3; value: 1.5 }
                Label { text: "t = " + scrubber.value.toFixed(2) + "s"; color: "#a2b2c9" }
            }
        }
    }
}
