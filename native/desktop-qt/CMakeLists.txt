find_package(Qt6 6.4 REQUIRED COMPONENTS Quick QuickControls2 Qml Multimedia Concurrent)
qt_standard_project_setup(REQUIRES 6.4)
qt_add_executable(nymi-desktop main.cpp AppBridge.cpp AppBridge.hpp FabricatorWorkspace.cpp FabricatorWorkspace.hpp)
set_source_files_properties(qml/Main.qml PROPERTIES QT_RESOURCE_ALIAS Main.qml)
set_source_files_properties(qml/FabricatorPage.qml PROPERTIES QT_RESOURCE_ALIAS FabricatorPage.qml)
qt_add_qml_module(nymi-desktop URI NymiDesktop VERSION 1.0
  RESOURCE_PREFIX "/qt/qml"
  QML_FILES qml/Main.qml qml/FabricatorPage.qml
)
target_link_libraries(nymi-desktop PRIVATE Qt6::Quick Qt6::QuickControls2 Qt6::Qml Qt6::Multimedia
  Qt6::Concurrent nymi-core nymi-native-data nymi-fabricator)
target_compile_features(nymi-desktop PRIVATE cxx_std_20)
set_target_properties(nymi-desktop PROPERTIES WIN32_EXECUTABLE TRUE)

if(BUILD_TESTING)
  add_executable(nymi-fabricator-workspace-tests
    tests/FabricatorWorkspaceTest.cpp FabricatorWorkspace.cpp FabricatorWorkspace.hpp)
  set_target_properties(nymi-fabricator-workspace-tests PROPERTIES AUTOMOC ON)
  target_include_directories(nymi-fabricator-workspace-tests PRIVATE ${CMAKE_CURRENT_SOURCE_DIR})
  target_link_libraries(nymi-fabricator-workspace-tests PRIVATE Qt6::Core nymi-native-data nymi-fabricator)
  add_test(NAME nymi-fabricator-workspace COMMAND nymi-fabricator-workspace-tests)
endif()
