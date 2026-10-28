const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

const { transformer, resolver } = config;

config.transformer = {
  ...transformer,
  babelTransformerPath: require.resolve('react-native-svg-transformer/expo'),
};

config.resolver = {
  ...resolver,
  assetExts: resolver.assetExts.filter((ext) => ext !== 'svg'),
  sourceExts: [...resolver.sourceExts, 'svg'],
  unstable_enablePackageExports: false,
  // markdown-it (pulled in by react-native-markdown-display) requires Node's
  // deprecated built-in `punycode` module. Alias it to the userland package.
  extraNodeModules: {
    ...(resolver.extraNodeModules || {}),
    punycode: require.resolve('punycode/'),
  },
};

module.exports = config;
