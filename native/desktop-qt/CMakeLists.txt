find_package(Qt6 6.4 REQUIRED COMPONENTS Quick QuickControls2 Qml Multimedia Concurrent)
qt_standard_project_setup(REQUIRES 6.4)
qt_add_executable(nymi-desktop main.cpp AppBridge.cpp AppBridge.hpp)
set_source_files_properties(qml/Main.qml PROPERTIES QT_RESOURCE_ALIAS Main.qml)
qt_add_qml_module(nymi-desktop URI NymiDesktop VERSION 1.0
  RESOURCE_PREFIX "/qt/qml"
  QML_FILES qml/Main.qml
)
target_link_libraries(nymi-desktop PRIVATE Qt6::Quick Qt6::QuickControls2 Qt6::Qml Qt6::Multimedia
  Qt6::Concurrent nymi-core nymi-native-data nymi-fabricator)
target_compile_features(nymi-desktop PRIVATE cxx_std_20)
set_target_properties(nymi-desktop PROPERTIES WIN32_EXECUTABLE TRUE)
