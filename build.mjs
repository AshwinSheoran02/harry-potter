// Builds the static site into dist/ for GitHub Pages.
// All asset paths are relative, so the game works at https://ashwin.top/harry-potter/ (or any sub-path).
import { readFileSync, writeFileSync, mkdirSync, cpSync, rmSync } from 'node:fs';

const src = readFileSync('src/src.html', 'utf8');
const engine = readFileSync('src/engine.js', 'utf8');
const graph = readFileSync('src/board-graph.json', 'utf8').trim();
if (!src.includes('/*ENGINE*/') || !src.includes('/*GRAPH*/')) throw new Error('placeholders missing in src/src.html');
const body = src.replace('/*ENGINE*/', () => engine).replace('/*GRAPH*/', () => graph);

const page = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="description" content="Harry Potter: The Battle for the Wizarding World. A two-player tabletop board game by Group 3 (Pandas).">
<meta name="theme-color" content="#140c07">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Cpath d='M10 54 46 18' stroke='%23c9a24d' stroke-width='6' stroke-linecap='round'/%3E%3Ccircle cx='50' cy='14' r='8' fill='%23f2d68c'/%3E%3C/svg%3E">
</head>
<body>
${body}
</body>
</html>
`;

rmSync('dist', { recursive: true, force: true });
mkdirSync('dist', { recursive: true });
writeFileSync('dist/index.html', page);
cpSync('assets', 'dist/assets', { recursive: true });
// Unknown paths under /harry-potter/ fall back to the game instead of a GitHub 404
writeFileSync('dist/404.html', `<!doctype html><meta charset="utf-8"><title>Redirecting</title><script>location.replace(location.pathname.split('/').slice(0, 2).join('/') + '/');</script>`);
writeFileSync('dist/.nojekyll', '');
console.log('Built dist/ (' + page.length + ' bytes)');
