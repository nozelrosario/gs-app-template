const packageJson = require("./package.json");

module.exports = () => {
  const IS_UAT = process.env.APP_ENV === 'uat';
  const appVersion = process.env.APP_VERSION || packageJson.version || "1.0.0";
  const buildNumber = process.env.APP_BUILD_NUMBER || "1";
  const versionCode = parseInt(buildNumber, 10) || 1;

  return {
    expo: {
      name: IS_UAT ? "{{PROJECT_NAME}} (UAT)" : "{{PROJECT_NAME}}",
      slug: "{{PROJECT_SLUG}}",
      version: appVersion,
      orientation: "portrait",
      icon: "./assets/icon.png",
      userInterfaceStyle: "automatic",
      splash: {
        image: "./assets/splash.png",
        resizeMode: "contain",
        backgroundColor: "#ffffff"
      },
      ios: {
        supportsTablet: true,
        infoPlist: {
          ITSAppUsesNonExemptEncryption: false
        },
        bundleIdentifier: IS_UAT ? "{{BUNDLE_ID}}.uat" : "{{BUNDLE_ID}}",
        buildNumber: String(buildNumber)
      },
      android: {
        versionCode: versionCode,
        adaptiveIcon: {
          foregroundImage: "./assets/adaptive-icon.png",
          backgroundColor: "#ffffff"
        },
        package: IS_UAT ? "{{BUNDLE_ID}}.uat" : "{{BUNDLE_ID}}"
      },
      web: {
        favicon: "./assets/favicon.png"
      },
      extra: {
        env: IS_UAT ? 'uat' : 'prod',
        eas: {
          projectId: "{{EAS_PROJECT_ID}}"
        }
      },
      owner: "{{GITHUB_USER}}"
    }
  };
};
