// Extends app.json; forces "web" platform for react-native-web review builds.
module.exports = ({ config }) => {
  const platforms = new Set([...(config.platforms || ["ios", "android"]), "web"]);
  config.platforms = [...platforms];
  return config;
};
