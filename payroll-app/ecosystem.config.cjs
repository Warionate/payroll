module.exports = {
  apps: [
    {
      name: 'payroll-app',
      script: './server/dist/index.js',
      env_production: {
        NODE_ENV: 'production',
        PORT: 4001,
      },
      // ARM A1.Flex (4 OCPU / 24GB RAM) 最適化
      instances: 1, // アプリケーション内部でクラスタリングを行うため1に変更
      exec_mode: 'fork', // PM2のクラスタモードではなくforkモードを使用
      autorestart: true,
      watch: false,
      // 注意: fork モード + アプリ内部 cluster のため、PM2 が監視するのは
      // primary プロセスの RSS のみ。ワーカー（子プロセス）のメモリはこの
      // 制限にかからない（ワーカーのリークは OS 側 OOM killer → 再フォーク）。
      max_memory_restart: '4G',
      min_uptime: '30s', // 30秒以上動けば「安定稼働」とみなす
      max_restarts: 20, // min_uptime以内の連続クラッシュが20回続いたら停止
      // SIGINT 後、graceful shutdown（アプリ側 15 秒猶予）を待ってから SIGKILL。
      // 既定の 1600ms では猶予が使われないため、アプリ側より長く取る。
      kill_timeout: 20000,
    },
  ],
};
