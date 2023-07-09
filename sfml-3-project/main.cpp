#include <SFML/Window.hpp>

int main() {
    sf::Window window(sf::VideoMode({800, 600}), "SFML");

    for (sf::Event event; window.pollEvent(event););

    window.display();

    return 0;
}
