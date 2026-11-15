find_package(Qt6 6.4 REQUIRED COMPONENTS Core)
add_library(nymi-native-data STATIC
    NativeDataReader.cpp
    NativeDataReader.hpp
)
target_include_directories(nymi-native-data PUBLIC ${CMAKE_CURRENT_SOURCE_DIR})
target_compile_features(nymi-native-data PUBLIC cxx_std_20)
target_link_libraries(nymi-native-data PUBLIC Qt6::Core)

add_executable(nymi-native-verify tools/verify.cpp)
target_link_libraries(nymi-native-verify PRIVATE nymi-native-data)

if(BUILD_TESTING)
    add_executable(nymi-native-data-tests tests/NativeDataReaderTest.cpp)
    target_link_libraries(nymi-native-data-tests PRIVATE nymi-native-data)
    add_test(NAME nymi-native-data COMMAND nymi-native-data-tests)
endif()
