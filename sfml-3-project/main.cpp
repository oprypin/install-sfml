#include <SFML/Window.hpp>

int main() {
    sf::Window window(sf::VideoMode({800, 600}), "SFML");

    while (const auto event = window.pollEvent())

    window.display();

    return 0;
}
