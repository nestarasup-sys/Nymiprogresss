find_package(Qt6 6.5 REQUIRED COMPONENTS Quick QuickControls2 Qml)
qt_standard_project_setup(REQUIRES 6.5)
qt_add_executable(nymi-desktop main.cpp AppBridge.cpp AppBridge.hpp)
qt_add_qml_module(nymi-desktop URI NymiDesktop VERSION 1.0
  QML_FILES qml/Main.qml
)
target_link_libraries(nymi-desktop PRIVATE Qt6::Quick Qt6::QuickControls2 Qt6::Qml nymi-core)
target_compile_features(nymi-desktop PRIVATE cxx_std_20)
set_target_properties(nymi-desktop PROPERTIES WIN32_EXECUTABLE TRUE)
