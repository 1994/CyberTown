import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import { loadRuntimeConfig } from './runtime-config.ts';
import './styles.css';
import './playful.css';
import './phone.css';
import './touch.css';
import './hud-polish.css';
import './sound.css';
import './ui-polish.css';

async function start() {
  await loadRuntimeConfig();
  createRoot(document.getElementById('root')!).render(
    <StrictMode><App /></StrictMode>,
  );
}
void start().catch((error: unknown) => {
  const root = document.getElementById('root')!;
  const panel = document.createElement('div');
  panel.className = 'boot-screen';
  panel.setAttribute('role', 'alert');
  panel.textContent = error instanceof Error ? error.message : '前端配置加载失败';
  const retry = document.createElement('button');
  retry.className = 'btn primary';
  retry.textContent = '重新加载';
  retry.onclick = () => location.reload();
  panel.append(retry);
  root.replaceChildren(panel);
});
