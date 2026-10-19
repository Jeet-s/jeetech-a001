// Extends app.json with the monetization plugins. The AdMob app id comes from
// monetization.json (written per app by the factory from its Play slot).
const monetization = require("./monetization.json");
const cloud = require("./cloud.json");
// Plain-HTTP cloud only for a LOCAL App Cloud (emulator → this Mac, http://10.0.2.2…); real cloud URLs are HTTPS.
const localCloud = /^http:\/\/(10\.0\.2\.2|localhost|127\.0\.0\.1)(:|\/|$)/.test(cloud.apiUrl || "");

module.exports = ({ config }) => ({
  ...config,
  plugins: [
    [
      "react-native-google-mobile-ads",
      {
        androidAppId: monetization.admob.appId,
        // Consent (UMP) is gathered before the SDK starts serving.
        delayAppMeasurementInit: true,
      },
    ],
    // Pin Google Play Billing (no store flavors to pick at build time).
    ["expo-iap", { android: { store: "play" } }],
    [
      "expo-build-properties",
      {
        android: {
          minSdkVersion: 24,
          usesCleartextTraffic: localCloud,
          // Release builds are minified (R8). Room/WorkManager (pulled in by the
          // AdMob SDK) load generated *_Impl classes by reflection — without
          // these rules the app crashes on launch.
          extraProguardRules: [
            "-keep class * extends androidx.room.RoomDatabase { <init>(); }",
            "-keep class androidx.work.impl.** { *; }",
            "-keep class androidx.startup.** { *; }",
            "-dontwarn androidx.work.**",
          ].join("\n"),
        },
      },
    ],
  ],
});
