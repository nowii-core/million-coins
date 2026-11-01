# Million Coins

A first-person WebGL2 vault game: one million gold coins are piled in a mountain, and somewhere underneath lies a small wooden stick. Dig down with your magnet, fill your bag, deposit coins for cash, upgrade, and find the stick to win.

**Play:** open `index.html` in a modern browser (double-click). No build, no dependencies.

## Controls
- Mouse: look (click to lock pointer) · Left click (hold): magnet
- WASD / arrows: move · Shift: run · E: deposit coins / grab the stick · U: upgrades · Esc: pause
- Touch: left joystick, drag to look, MAGNET and E buttons

## How it works
1,000,000 coins are never simulated individually: the pile is a granular heightfield (thermal erosion with an angle of repose) rendered with ~40k instanced procedural coins, plus dynamic physical coins flying to your magnet. Everything (textures, audio, models) is generated in code.

## License
MIT
