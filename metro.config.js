const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// admin-web/ is a separate Vite app that lives in this repo but is never part
// of a bundle. It carries its own node_modules with its own copy of react and
// react-dom, and Metro crawls the whole project root — so without this it would
// find two Reacts and fail with a duplicate-module (haste) collision.
const ADMIN_WEB_RE = new RegExp(
  `^${path.resolve(__dirname, 'admin-web').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/.*`,
);

const { transformer, resolver } = config;

config.transformer = {
  ...transformer,
  babelTransformerPath: require.resolve('react-native-svg-transformer/expo'),
};

config.resolver = {
  ...resolver,
  blockList: [...(resolver.blockList ? [resolver.blockList].flat() : []), ADMIN_WEB_RE],
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
