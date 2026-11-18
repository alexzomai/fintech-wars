import { defineConfig } from 'vite';

export default defineConfig({
  // Доступ через tailscale serve (https://<машина>.<tailnet>.ts.net:10317).
  server: { host: '127.0.0.1', port: 5317, strictPort: true, allowedHosts: ['.ts.net'], watch: { ignored: ['**/.wt/**'] } }, // .wt — worktree сабагентов
});
