Million Coins

One million gold coins. One hidden stick. One mission: find it.

Million Coins is an experimental first-person 3D browser game built with vanilla HTML, CSS, JavaScript, and WebGL2. Explore a massive underground treasure vault, collect gold coins using a magnetic tool, deposit your loot, purchase equipment upgrades, and dig your way toward the hidden wooden stick.

A lightweight, zero-dependency gaming experience featuring procedural 3D environments, custom WebGL2 rendering, dynamic coin interactions, and responsive controls.

Overview | Features | Preview | Tech Stack | Quick Start | Controls | Project Structure | License

Overview

Million Coins is a first-person treasure-hunting game built around a simple but challenging objective: find a hidden wooden stick buried beneath a mountain of one million gold coins.

Players explore a large underground vault using a magnetic collection tool to attract nearby coins. Collected treasure can be transported to a deposit machine and exchanged for cash, which can then be used to purchase equipment upgrades.

Instead of simulating one million individual physical objects, the treasure pile uses a granular heightfield and instanced procedural coin rendering to maintain a highly efficient rendering pipeline.

Features

First-Person 3D Gameplay — Explore a detailed underground vault through an immersive first-person perspective.

One Million Gold Coins — A massive procedural treasure environment featuring a granular coin pile.

Magnetic Collection System — Attract nearby coins using a magnetic tool and collect your treasure.

Dynamic Coin Interactions — Coins move dynamically and fly toward your collection tool.

Deposit & Economy System — Transport collected coins to the deposit machine and convert your loot into cash.

Equipment Upgrades — Improve magnet performance, bag capacity, and battery capacity using earned money.

Hidden Treasure Objective — Dig through the mountain of gold to discover the hidden wooden stick.

Procedural 3D Environment — Custom geometry, generated textures, lighting, and rendering created directly through JavaScript and WebGL2.

Real-Time HUD — Displays money, remaining coins, depth, bag capacity, and battery status.

Cross-Platform Controls — Desktop keyboard/mouse support and fully functional mobile touch controls.

Zero Dependencies — Built entirely with vanilla HTML, CSS, and JavaScript without external frameworks or build tools.

Preview

🎮 Play Live Demo Here

Tech Stack

Technology

Purpose

HTML5

Game structure, interface layout, and canvas surface

CSS3

Responsive HUD, menus, overlay styling, and touch controls

JavaScript (ES6+)

Game engine, physics logic, procedural generation, and state management

WebGL2

Custom 3D graphics rendering pipeline, shaders, and GPU acceleration

Canvas API

Dynamic texture generation and image processing

Quick Start

Requirements

Any modern browser supporting WebGL2 (Chrome, Safari, Firefox, Edge).

Keyboard & Mouse (Desktop) or Touch Screen (Mobile).

Run Locally

Clone the repository:

git clone https://github.com/nowii-core/million-coins.git


Navigate to the project folder:

cd million-coins/millioncoins


Start a local development server:

python3 -m http.server 8000


Open in your browser:
Go to http://localhost:8000

Controls

Action

Desktop

Mobile

Move

WASD / Arrow Keys

Virtual Joystick

Look around

Mouse Drag

Touch Drag

Collect coins

Hold Left Click

MAGNET Button

Deposit / Interact

E

E Button

Run

Shift

—

Upgrades

U

Upgrade Menu Button

Pause

Esc

Pause Button

Project Structure

million-coins/
└── millioncoins/
    ├── index.html       # Main game structure and HUD layout
    ├── style.css        # Responsive styling and UI overlays
    ├── script.js        # Core WebGL2 engine & game logic
    ├── graphic1.png     # Preview image 1
    ├── graphic2.png     # Preview image 2
    ├── README.md        # Project documentation
    └── LICENSE          # MIT License


Performance & Rendering

Million Coins uses a custom WebGL2 rendering pipeline designed specifically for high-density particle environments:

Heightfield & Thermal Erosion: The treasure pile geometry is calculated dynamically.

GPU Instancing: Handles ~40,000 active coin representations simultaneously without dropping frame rates.

Procedural Generation: All textures and 3D shapes are generated at runtime via code, eliminating heavy external asset loading.

License

Distributed under the MIT License. See LICENSE for more information.

## Contact & Support

- **Maintainer:** [@nowii-core](https://github.com/nowii-core)
- **Repository:** [nowii-core/million-coins](https://github.com/nowii-core/million-coins)
- **Issues & Feature Requests:** [Submit an Issue](https://github.com/nowii-core/million-coins/issues)

---

<div align="center">
  <sub>Designed and developed by <b>nowii-core</b></sub>
</div>
