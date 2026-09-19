module.exports = function withCriticalDispatchAlertFgs(config) {
  return require("../../../packages/expo-push-kit/plugin/withCriticalOrderAlertFgs")(config, {
    role: "rider",
  });
};
