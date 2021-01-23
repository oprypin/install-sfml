cmake_minimum_required(VERSION 3.1)
project(test)

list(APPEND CMAKE_MODULE_PATH "/usr/share/SFML/cmake/Modules")
list(APPEND CMAKE_MODULE_PATH "/usr/local/share/SFML/cmake/Modules")

find_package(SFML 2.3 COMPONENTS system window REQUIRED)

add_executable(main main.cpp)
target_link_libraries(main sfml-window sfml-system)
