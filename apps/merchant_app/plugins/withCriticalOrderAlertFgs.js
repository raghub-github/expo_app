module.exports = function withCriticalOrderAlertFgs(config) {
  return require("../../../packages/expo-push-kit/plugin/withCriticalOrderAlertFgs")(config, {
    role: "merchant",
  });
};
