const path = require('path');

module.exports = {
  presets: ['babel-preset-expo'],

  // Scoped to our own source on purpose. WatermelonDB models are built from
  // decorated definite-assignment fields (`@text('trainer_id') trainerId!: string`),
  // which Babel's TypeScript transform rejects unless class properties compile in
  // loose mode. Applying that globally would also change how React Native's own
  // `#private` methods compile in node_modules — so we keep it to src/.
  overrides: [
    {
      test: (filename) =>
        !!filename && filename.startsWith(path.join(__dirname, 'src') + path.sep),
      plugins: [
        ['@babel/plugin-proposal-decorators', { legacy: true }],
        ['@babel/plugin-transform-class-properties', { loose: true }],
      ],
    },
  ],
};
