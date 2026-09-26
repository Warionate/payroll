module.exports = {
  apps: [
    {
      name: 'payroll-status',
      script: './dist/index.js',
      env_production: {
        NODE_ENV: 'production',
        PORT: 4002,
      },
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '300M',
      min_uptime: '10s',
      max_restarts: 10,
    },
  ],
};
