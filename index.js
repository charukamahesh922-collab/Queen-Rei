const { startBot } = require('./handlers/botClient');

console.log('\n👑 Starting Queen Rei...\n');

startBot().catch((err) => {
  console.error('❌ Failed to start:', err.message);
  process.exit(1);
});

process.on('SIGINT', () => {
  console.log('\n👋 Queen Rei signing off.');
  process.exit(0);
});
