import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';

export interface ScaffoldOptions {
  name: string;
  template: 'static-site' | 'react-app' | 'api';
  prefix?: string;
}

export function scaffoldProject(options: ScaffoldOptions): string {
  const dirName = `${options.prefix ?? 'murph-gen'}-${options.name}-${randomUUID().slice(0, 8)}`;
  const projectDir = join(tmpdir(), dirName);
  mkdirSync(projectDir, { recursive: true });

  switch (options.template) {
    case 'static-site':
      scaffoldStaticSite(projectDir, options.name);
      break;
    case 'react-app':
      scaffoldReactApp(projectDir, options.name);
      break;
    case 'api':
      scaffoldApi(projectDir, options.name);
      break;
  }

  return projectDir;
}

function scaffoldStaticSite(dir: string, name: string): void {
  writeFileSync(join(dir, 'index.html'), `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${name}</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <h1>${name}</h1>
  <script src="main.js"></script>
</body>
</html>`);

  writeFileSync(join(dir, 'style.css'), `* { margin: 0; padding: 0; box-sizing: border-box; }\nbody { font-family: system-ui, sans-serif; }\n`);
  writeFileSync(join(dir, 'main.js'), `// ${name}\nconsole.log('${name} loaded');\n`);
}

function scaffoldReactApp(dir: string, name: string): void {
  writeFileSync(join(dir, 'package.json'), JSON.stringify({
    name,
    private: true,
    scripts: { dev: 'vite', build: 'vite build' },
    dependencies: { react: '^18', 'react-dom': '^18' },
    devDependencies: { vite: '^5', '@vitejs/plugin-react': '^4' },
  }, null, 2));

  mkdirSync(join(dir, 'src'), { recursive: true });
  writeFileSync(join(dir, 'src', 'App.jsx'), `export default function App() {\n  return <h1>${name}</h1>;\n}\n`);
  writeFileSync(join(dir, 'src', 'main.jsx'), `import React from 'react';\nimport ReactDOM from 'react-dom/client';\nimport App from './App';\n\nReactDOM.createRoot(document.getElementById('root')).render(<App />);\n`);
  writeFileSync(join(dir, 'index.html'), `<!DOCTYPE html>\n<html><head><title>${name}</title></head><body><div id="root"></div><script type="module" src="/src/main.jsx"></script></body></html>`);
}

function scaffoldApi(dir: string, name: string): void {
  writeFileSync(join(dir, 'package.json'), JSON.stringify({
    name,
    private: true,
    type: 'module',
    scripts: { start: 'node index.js' },
    dependencies: { hono: '^4' },
  }, null, 2));

  writeFileSync(join(dir, 'index.js'), `import { Hono } from 'hono';\n\nconst app = new Hono();\napp.get('/', (c) => c.json({ name: '${name}', status: 'ok' }));\n\nexport default app;\n`);
}
