# Harry Potter: The Battle for the Wizarding World

A digital tabletop edition of a two-player board game originally designed and built by Group 3 (Pandas) for a Game Design and Development course.

Play it at **https://ashwin.top/harry-potter/**

## The game

Harry races to reach the wand while Voldemort hunts him. Once Harry holds the wand, he has 15 moves to catch Voldemort.

- Original printed board with 91 spaces and 116 paths
- Movement dice (Harry 1 to 6, Voldemort 1 to 3) and a symbol special die for obstacles
- Galleons, money blocks, 17 spell cards and the five-move freeze rule
- Play against a computer Voldemort, or two players on one device
- Hidden developer mode (menu, Developer mode) for editing the board graph

## Project layout

| Path | What it is |
| --- | --- |
| `src/engine.js` | Rules engine and computer opponent (pure JavaScript, no DOM) |
| `src/board-graph.json` | Space positions, types and path connections |
| `src/src.html` | Tabletop presentation: board, pieces, dice, cards, menus |
| `assets/board.jpg` | Original board artwork |
| `build.mjs` | Inlines the engine and graph into `dist/index.html` |
| `tests/` | Engine tests, simulations and browser tests |

## Develop

```bash
npm test          # rules engine + computer opponent simulations
npm run build     # writes dist/
npm run serve     # http://localhost:8080/harry-potter/
npm run test:ui   # browser tests (needs Playwright, run with the server up)
```

Every push to `main` runs the tests, builds `dist/` and deploys it to GitHub Pages.
